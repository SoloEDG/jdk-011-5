import { key, type Vec3, type WorldDocument } from "../../../shared/document";
import { moves, standable } from "./walk";

export type PlanStatus =
  | "searching"
  | "found"
  | "occupied"
  | "nostart"
  | "unreachable";

// 世界最多 32×32×20 格，扩展上限留有余量；兜底防止异常情况下无限搜索
const MAX_EXPAND = 25000;

export interface Planner {
  step(budget: number): PlanStatus;
  path(): Vec3[];
}

// 增量 A*：每次 step() 只扩展 budget 个节点，短路径几帧内完成，
// 不必等远处区域全部搜完；只有判定"不连通"才需要穷尽可达区域
export function createPlanner(
  doc: WorldDocument,
  start: Vec3,
  goal: Vec3,
): Planner {
  const goalKey = key(goal);
  const startKey = key(start);
  const h = (c: Vec3) => {
    const dx = Math.abs(c.x - goal.x),
      dz = Math.abs(c.z - goal.z);
    return (
      Math.max(dx, dz) +
      (Math.SQRT2 - 1) * Math.min(dx, dz) +
      Math.abs(c.y - goal.y) * 0.5
    );
  };
  // 二叉堆，元素为 [f, 格 key]
  const heap: [number, string][] = [];
  const push = (f: number, k: string) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const cells = new Map<string, Vec3>([[startKey, start]]);
  const g = new Map<string, number>([[startKey, 0]]);
  const came = new Map<string, string>();
  const closed = new Set<string>();
  let done: PlanStatus | null = !standable(doc, goal)
    ? "occupied"
    : !standable(doc, start)
      ? "nostart"
      : null;
  let expanded = 0;
  if (!done) push(h(start), startKey);
  return {
    step(budget) {
      if (done) return done;
      let n = budget;
      while (n-- > 0 && heap.length) {
        const [, k] = pop();
        if (closed.has(k)) continue;
        closed.add(k);
        if (k === goalKey) return (done = "found");
        if (++expanded > MAX_EXPAND) return (done = "unreachable");
        const c = cells.get(k)!,
          gc = g.get(k)!;
        for (const m of moves(doc, c)) {
          const mk = key(m.to),
            ng = gc + m.cost;
          if (closed.has(mk) || ng >= (g.get(mk) ?? Infinity)) continue;
          g.set(mk, ng);
          cells.set(mk, m.to);
          came.set(mk, k);
          push(ng + h(m.to), mk);
        }
      }
      return heap.length ? "searching" : (done = "unreachable");
    },
    path() {
      if (done !== "found") return [];
      const cellsPath: Vec3[] = [];
      for (let k: string | undefined = goalKey; k; k = came.get(k))
        cellsPath.push(cells.get(k)!);
      cellsPath.reverse();
      // 合并同向的连续路段，得到转折点序列
      const out: Vec3[] = [];
      for (let i = 0; i < cellsPath.length; i++) {
        const a = cellsPath[i - 1],
          b = cellsPath[i],
          c = cellsPath[i + 1];
        if (
          a &&
          c &&
          Math.sign(b.x - a.x) === Math.sign(c.x - b.x) &&
          Math.sign(b.y - a.y) === Math.sign(c.y - b.y) &&
          Math.sign(b.z - a.z) === Math.sign(c.z - b.z)
        )
          continue;
        out.push(b);
      }
      return out;
    },
  };
}
