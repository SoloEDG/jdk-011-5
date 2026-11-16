import type { Workspace } from "../../../shared/document";
import { collides } from "./collision";
export interface Motion {
  vertical: number;
  grounded: boolean;
}
export interface Intent {
  dx: number;
  dz: number;
  jump: boolean;
}
export function stepPlayer(
  s: Workspace,
  intent: Intent,
  motion: Motion,
  dt: number,
) {
  if (s.mode !== "walk") return;
  const p = s.doc.player;
  const speed = 4 * dt;
  let dx = intent.dx,
    dz = intent.dz;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  dx *= speed;
  dz *= speed;
  for (const [axis, amount] of [
    ["x", dx],
    ["z", dz],
  ] as const) {
    if (!amount) continue;
    const next = { ...p, [axis]: p[axis] + amount };
    if (
      Math.abs(next.x) < 15 &&
      Math.abs(next.z) < 15 &&
      !collides(s.doc, next)
    )
      p[axis] = next[axis];
  }
  if (intent.jump && motion.grounded) {
    motion.vertical = 6;
    motion.grounded = false;
  }
  motion.vertical -= 18 * dt;
  const next = { ...p, y: p.y + motion.vertical * dt };
  if (collides(s.doc, next)) {
    motion.grounded = motion.vertical < 0;
    motion.vertical = 0;
  } else {
    p.y = next.y;
    motion.grounded = false;
  }
  if (p.y < -5) {
    Object.assign(p, { x: 0, y: 12, z: 9 });
    motion.vertical = 0;
  }
  s.dirty = true;
}
