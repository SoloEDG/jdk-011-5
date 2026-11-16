import type { Workspace } from "../../../shared/document";
import { stepPlayer, type Intent, type Motion } from "../lib/physics";
import { cancelNavigation, updateNavigation } from "../../navigate";
export function attachPlayer(s: Workspace) {
  const keys = new Set<string>();
  const motion: Motion = { vertical: 0, grounded: false };
  const down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input,textarea")) return;
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(e.code) &&
      s.mode === "walk"
    ) {
      e.preventDefault();
      keys.add(e.code);
    }
  };
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  const blur = () => keys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  let prev = performance.now(),
    id = 0;
  function tick(now: number) {
    const dt = Math.min((now - prev) / 1000, 0.04);
    prev = now;
    let intent: Intent = { dx: 0, dz: 0, jump: false };
    if (s.mode === "walk") {
      const manual: Intent = {
        dx: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        dz: Number(keys.has("KeyS")) - Number(keys.has("KeyW")),
        jump: keys.has("Space"),
      };
      const wantsManual = manual.dx !== 0 || manual.dz !== 0 || manual.jump;
      const nav = updateNavigation(s, motion, dt);
      if (nav && wantsManual) cancelNavigation(s, "已手动接管，停止自动带路");
      intent = nav && !wantsManual ? nav : manual;
    }
    stepPlayer(s, intent, motion, dt);
    id = requestAnimationFrame(tick);
  }
  id = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(id);
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}
