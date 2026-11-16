export type MaterialId =
  "grass" | "soil" | "stone" | "wood" | "sand" | "brick" | "glass" | "leaf";
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Block extends Vec3 {
  material: MaterialId;
}
export interface NavSave {
  goal: Vec3;
  confirmed: Vec3[];
}
export interface WorldDocument {
  version: 1;
  name: string;
  blocks: Record<string, Block>;
  inventory: Record<MaterialId, number>;
  player: Vec3;
  revision: number;
  nav: NavSave | null;
}
export interface Region {
  a: Vec3;
  b: Vec3;
}
export type Tool = "place" | "remove" | "select";
export interface NavState {
  goal: Vec3;
  confirmed: Vec3[];
  path: Vec3[];
  cursor: number;
  status: "planning" | "following";
  stuck: number;
  progress: number;
  revision: number;
  v: number;
}
export interface Workspace {
  doc: WorldDocument;
  material: MaterialId;
  tool: Tool;
  region: Region | null;
  anchor: Vec3 | null;
  message: string;
  dirty: boolean;
  mode: "build" | "walk";
  savedAt: string | null;
  nav: NavState | null;
}
export const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
export const inside = (p: Vec3) =>
  p.x >= -16 && p.x < 16 && p.z >= -16 && p.z < 16 && p.y >= 0 && p.y < 20;
