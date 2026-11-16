import {
  key,
  type Vec3,
  type Workspace,
  type WorldDocument,
  type NavState,
} from "../../../shared/document";
import type { SceneHit } from "../../../shared/commands";
import type { Intent, Motion } from "../../player/lib/physics";
import { createPlanner, type Planner } from "../lib/astar";
import { moves, nearestStandable, standable } from "../lib/walk";

// 每帧寻路扩展预算：短路径一两帧内出结果，长路径分摊到多帧不卡界面
const PLAN_BUDGET = 500;
// 存档里保留的已确认路段上限
const CONFIRMED_MAX = 200;
// 行走受阻多久判定需要重新规划（秒）
const STUCK_LIMIT = 2.5;

let planner: Planner | null = null;

const playerCell = (s: Workspace): Vec3 => ({
  x: Math.floor(s.doc.player.x),
  y: Math.floor(s.doc.player.y),
  z: Math.floor(s.doc.player.z),
});

function freshState(s: Workspace, goal: Vec3, confirmed: Vec3[]): NavState {
  return {
    goal: { ...goal },
    confirmed,
    path: [],
    cursor: 0,
    status: "planning",
    stuck: 0,
    progress: Infinity,
    revision: s.doc.revision,
    v: 0,
  };
}

// 行走模式下点击方块：把点击面附近最近的可站立格设为目的地
export function setNavGoal(s: Workspace, hit: SceneHit) {
  const goal = nearestStandable(s.doc, hit.adjacent, 1) ?? hit.adjacent;
  planner = null;
  s.nav = freshState(s, goal, []);
  s.doc.nav = { goal: { ...goal }, confirmed: [] };
  s.mode = "walk";
  s.dirty = true;
  s.message = `正在规划前往 (${goal.x}, ${goal.y}, ${goal.z}) 的路线…`;
}

// 载入存档后恢复：不信旧路线，按当前地形从角色位置重新规划
export function resumeNavigation(s: Workspace) {
  const saved = s.doc.nav;
  if (!saved?.goal) return;
  planner = null;
  s.nav = freshState(s, saved.goal, [...saved.confirmed]);
  s.mode = "walk";
  s.message = "已恢复目的地，正在按当前地形重新规划路线";
}

export function cancelNavigation(s: Workspace, message = "已停止自动带路") {
  planner = null;
  s.nav = null;
  if (s.doc.nav) {
    s.doc.nav = null;
    s.dirty = true;
  }
  s.message = message;
}

// 逐格验证剩余路段：路径是经过同向压缩的转折点序列，
// 先把每段展开回单位步长，再检查每格可站立、每步移动合法
function chainValid(doc: WorldDocument, cells: Vec3[]) {
  for (let i = 0; i < cells.length; i++) {
    if (!standable(doc, cells[i])) return false;
    if (i + 1 < cells.length) {
      const a = cells[i],
        b = cells[i + 1];
      const sx = Math.sign(b.x - a.x),
        sy = Math.sign(b.y - a.y),
        sz = Math.sign(b.z - a.z);
      const cur = { ...a };
      while (cur.x !== b.x || cur.y !== b.y || cur.z !== b.z) {
        const prev = { ...cur };
        cur.x += sx;
        cur.y += sy;
        cur.z += sz;
        if (!standable(doc, cur)) return false;
        if (!moves(doc, prev).some((m) => key(m.to) === key(cur)))
          return false;
      }
    }
  }
  return true;
}

function replan(s: Workspace, nav: NavState, message: string) {
  planner = null;
  nav.status = "planning";
  nav.path = [];
  nav.cursor = 0;
  nav.v++;
  nav.stuck = 0;
  nav.progress = Infinity;
  s.message = message;
}

function arrive(s: Workspace, nav: NavState) {
  const g = nav.goal;
  cancelNavigation(s, `已到达目的地 (${g.x}, ${g.y}, ${g.z})`);
}

// 每帧驱动：规划中则消耗预算逐步搜索；跟随中则先验证再给出移动意图。
// 全程只读地形、不写库存；移动经物理碰撞执行，不会走进墙内。
export function updateNavigation(
  s: Workspace,
  motion: Motion,
  dt: number,
): Intent | null {
  const nav = s.nav;
  if (!nav) {
    planner = null;
    return null;
  }
  if (nav.status === "planning") {
    if (!planner) {
      const start = nearestStandable(s.doc, playerCell(s), 2);
      if (!start) {
        cancelNavigation(s, "角色附近没有可站立的位置，无法规划路线");
        return null;
      }
      planner = createPlanner(s.doc, start, nav.goal);
    }
    const r = planner.step(PLAN_BUDGET);
    if (r === "found") {
      const path = planner.path();
      planner = null;
      // 规划跨越多帧，期间地形可能已被修改：先整链验证再上路
      if (!chainValid(s.doc, path)) {
        replan(s, nav, "地形发生变化，正在重新规划路线");
        return null;
      }
      nav.path = path;
      nav.cursor = 0;
      nav.status = "following";
      nav.revision = s.doc.revision;
      nav.stuck = 0;
      nav.progress = Infinity;
      nav.v++;
      s.message = `路线已就绪（${nav.path.length} 段），自动带路中`;
    } else if (r === "occupied") {
      cancelNavigation(s, "目标位置被方块占据，角色无法站立");
    } else if (r === "unreachable") {
      cancelNavigation(s, "目标位置可以站立，但通道不连通，无法到达");
    } else if (r === "nostart") {
      cancelNavigation(s, "角色附近没有可站立的位置，无法规划路线");
    }
    return null;
  }
  // 跟随中：地形被筑墙/填地/拆桥修改过时，重新验证剩余路段
  if (s.doc.revision !== nav.revision) {
    nav.revision = s.doc.revision;
    if (!chainValid(s.doc, nav.path.slice(nav.cursor))) {
      replan(s, nav, "地形发生变化，正在重新规划路线");
      return null;
    }
  }
  const p = s.doc.player;
  let wp = nav.path[nav.cursor];
  if (!wp) {
    arrive(s, nav);
    return null;
  }
  // 下一步在失效前安全停下： waypoint 已不可站立则原地停下重规划
  if (!standable(s.doc, wp)) {
    replan(s, nav, "前方路段失效，正在重新规划路线");
    return null;
  }
  const dx = wp.x + 0.5 - p.x,
    dz = wp.z + 0.5 - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3 && Math.abs(p.y - wp.y) < 0.45) {
    nav.confirmed.push({ ...wp });
    if (nav.confirmed.length > CONFIRMED_MAX) nav.confirmed.shift();
    if (s.doc.nav) s.doc.nav.confirmed = [...nav.confirmed];
    nav.cursor++;
    nav.v++;
    nav.stuck = 0;
    nav.progress = Infinity;
    s.dirty = true;
    wp = nav.path[nav.cursor];
    if (!wp) {
      arrive(s, nav);
      return null;
    }
    return updateNavigation(s, motion, dt);
  }
  // 长时间没有接近目标：可能被卡主，原地停下并重规划
  nav.stuck = dist < nav.progress - 0.02 ? 0 : nav.stuck + dt;
  nav.progress = Math.min(nav.progress, dist);
  if (nav.stuck > STUCK_LIMIT) {
    replan(s, nav, "行走受阻，正在重新规划路线");
    return null;
  }
  const intent: Intent = { dx: 0, dz: 0, jump: false };
  if (dist > 0.05) {
    intent.dx = dx / dist;
    intent.dz = dz / dist;
  }
  // 目标更高且已贴近台阶：自动起跳
  if (wp.y > p.y + 0.05 && motion.grounded && dist < 1.1) intent.jump = true;
  return intent;
}
