export const DIRECTIONS = [
  { id: "down", label: "下", arrow: "↓", yaw: 0 },
  { id: "down-left", label: "左下", arrow: "↙", yaw: -45 },
  { id: "left", label: "左", arrow: "←", yaw: -90 },
  { id: "up-left", label: "左上", arrow: "↖", yaw: -135 },
  { id: "up", label: "上", arrow: "↑", yaw: 180 },
  { id: "up-right", label: "右上", arrow: "↗", yaw: 135 },
  { id: "right", label: "右", arrow: "→", yaw: 90 },
  { id: "down-right", label: "右下", arrow: "↘", yaw: 45 },
] as const;

export type DirectionId = (typeof DIRECTIONS)[number]["id"];
export type Motion = "walk" | "run";
export type PoseIndex = 0 | 1 | 2;
export const MOTIONS: readonly Motion[] = ["walk", "run"];
export const POSE_LABELS = ["標準", "右足", "左足"] as const;
export const POSE_NAMES = ["neutral", "right", "left"] as const;
export const FRAME_SIZE = 64;
export const GROUND_PIXEL = FRAME_SIZE - 4;
export const FRAME_COUNT = 48;

export interface RenderSettings {
  cameraElevation: number;
  scale: number;
  groundOffset: number;
  facingOffset: number;
  motionStrength: number;
  headScale: number;
}

export interface PixelSettings {
  colors: number;
  outline: boolean;
  dither: boolean;
  contrast: number;
  saturation: number;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  cameraElevation: 8,
  scale: 1,
  groundOffset: 0,
  facingOffset: 0,
  motionStrength: 1,
  headScale: 1.25,
};
export const DEFAULT_PIXEL_SETTINGS: PixelSettings = {
  colors: 15,
  outline: true,
  dither: false,
  contrast: 1.08,
  saturation: 1.12,
};

export interface RawFrame {
  direction: DirectionId;
  motion: Motion;
  pose: PoseIndex;
  pixels: ImageData;
}

export interface SpriteFrame extends RawFrame {
  filename: string;
}

export interface SpriteResult {
  frames: SpriteFrame[];
  palette: [number, number, number][];
  sheet: HTMLCanvasElement;
  walkSheet: HTMLCanvasElement;
  runSheet: HTMLCanvasElement;
  clippedFrames: number;
}

export interface ModelInfo {
  name: string;
  version: string;
  author: string;
  warnings: string[];
}

export type ProgressCallback = (current: number, total: number) => void;
