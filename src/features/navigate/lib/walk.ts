import {
  inside,
  key,
  type Vec3,
  type WorldDocument,
} from "../../../shared/document";
import { collides } from "../../player/lib/collision";

// 角色一次最多下落的格数（再深容易走进出不来的坑）
export const MAX_DROP = 3;

// 角色碰撞盒中心被物理限制在 |x|,|z| < 15，对应可站立格范围
const reachable = (c: Vec3) =>
  inside(c) && c.x >= -15 && c.x <= 14 && c.z >= -15 && c.z <= 14;

// 角色真实碰撞盒（宽 ±0.28、高 1.65）能否容纳在格心处
export const fits = (doc: WorldDocument, x: number, y: number, z: number) =>
  !collides(doc, { x: x + 0.5, y, z: z + 0.5 });

export const solid = (doc: WorldDocument, x: number, y: number, z: number) =>
  !!doc.blocks[key({ x, y, z })];

// 可站立：脚下有支撑，且身体（脚底与头顶两格）容纳得下
export function standable(doc: WorldDocument, c: Vec3) {
  return (
    reachable(c) &&
    c.y >= 1 &&
    fits(doc, c.x, c.y, c.z) &&
    solid(doc, c.x, c.y - 1, c.z)
  );
}

export interface Move {
  to: Vec3;
  cost: number;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// 从站立格出发的合法移动：平地、上 1 级台阶（需头顶起跳空间）、
// 下落至多 MAX_DROP 格（需下落通道畅通），对角移动不许切角
export function moves(doc: WorldDocument, c: Vec3): Move[] {
  const out: Move[] = [];
  for (const [dx, dz] of DIRS) {
    const diag = dx !== 0 && dz !== 0;
    const nx = c.x + dx,
      nz = c.z + dz;
    for (const dy of [0, 1, -1, -2, -3] as const) {
      if (dy < -MAX_DROP) break;
      const to = { x: nx, y: c.y + dy, z: nz };
      if (!standable(doc, to)) continue;
      // 上台阶：起跳时头顶（当前格上方第二格）必须腾空
      if (dy === 1 && !fits(doc, c.x, c.y + 2, c.z)) continue;
      // 下落：目标列从当前高度到落点之间必须全部腾空
      if (dy < 0) {
        let clear = true;
        for (let y = c.y + 1; y >= to.y + 2; y--)
          if (!fits(doc, nx, y, nz)) {
            clear = false;
            break;
          }
        if (!clear) continue;
      }
      // 对角：侧向两格在穿越高度必须容纳角色，防止切角穿墙
      if (diag) {
        const sy = Math.max(c.y, to.y);
        if (!fits(doc, nx, sy, c.z) || !fits(doc, c.x, sy, nz)) continue;
        if (
          dy === 1 &&
          (!fits(doc, nx, sy + 1, c.z) || !fits(doc, c.x, sy + 1, nz))
        )
          continue;
      }
      const cost =
        (diag ? Math.SQRT2 : 1) + (dy === 1 ? 0.4 : dy < 0 ? -dy * 0.15 : 0);
      out.push({ to, cost });
      break; // 每个方向取最近的可站立落点
    }
  }
  return out;
}

// 在目标附近找最近的可站立格（用于把点击位置吸附到可站处、定位角色脚下）
export function nearestStandable(
  doc: WorldDocument,
  c: Vec3,
  r = 2,
): Vec3 | null {
  const cands: Vec3[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -3; dy <= 2; dy++)
      for (let dz = -r; dz <= r; dz++)
        cands.push({ x: c.x + dx, y: c.y + dy, z: c.z + dz });
  cands.sort(
    (a, b) =>
      Math.abs(a.x - c.x) +
      Math.abs(a.y - c.y) +
      Math.abs(a.z - c.z) -
      (Math.abs(b.x - c.x) + Math.abs(b.y - c.y) + Math.abs(b.z - c.z)),
  );
  return cands.find((p) => standable(doc, p)) ?? null;
}
