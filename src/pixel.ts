import {
  DIRECTIONS,
  FRAME_COUNT,
  FRAME_SIZE,
  MOTIONS,
  POSE_NAMES,
  type PixelSettings,
  type RawFrame,
  type SpriteFrame,
  type SpriteResult,
} from "./types";

export type RGB = [number, number, number];
type WeightedColor = { color: RGB; count: number };
const OUTLINE: RGB = [16, 16, 33];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp = (value: number) => Math.max(0, Math.min(255, value));
export const toRGB555 = (value: number) =>
  Math.round((Math.round((clamp(value) * 31) / 255) * 255) / 31);

function colorKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function colorDistance(a: RGB, b: RGB): number {
  // Green and luminance edges matter most at this resolution.
  return (
    0.3 * (a[0] - b[0]) ** 2 +
    0.59 * (a[1] - b[1]) ** 2 +
    0.11 * (a[2] - b[2]) ** 2
  );
}

/** Area sampling with alpha coverage: RGB never mixes with transparent black. */
export function downsampleFrame(
  source: ImageData,
  settings: PixelSettings,
): ImageData {
  const data = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE * 4);
  const sx = source.width / FRAME_SIZE;
  const sy = source.height / FRAME_SIZE;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const left = x * sx;
      const right = (x + 1) * sx;
      const top = y * sy;
      const bottom = (y + 1) * sy;
      let alphaWeight = 0;
      const sum: RGB = [0, 0, 0];
      for (let py = Math.floor(top); py < Math.ceil(bottom); py++) {
        for (let px = Math.floor(left); px < Math.ceil(right); px++) {
          const area =
            Math.max(0, Math.min(right, px + 1) - Math.max(left, px)) *
            Math.max(0, Math.min(bottom, py + 1) - Math.max(top, py));
          const i = (py * source.width + px) * 4;
          const weight = (area * source.data[i + 3]!) / 255;
          alphaWeight += weight;
          sum[0] += source.data[i]! * weight;
          sum[1] += source.data[i + 1]! * weight;
          sum[2] += source.data[i + 2]! * weight;
        }
      }
      if (alphaWeight / (sx * sy) < 0.38) continue;
      const rgb: RGB = [
        sum[0] / alphaWeight,
        sum[1] / alphaWeight,
        sum[2] / alphaWeight,
      ];
      const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      const i = (y * FRAME_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const saturated =
          luminance + (rgb[channel]! - luminance) * settings.saturation;
        data[i + channel] = toRGB555(
          (saturated - 127.5) * settings.contrast + 127.5,
        );
      }
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, FRAME_SIZE, FRAME_SIZE);
}

function summarize(colors: WeightedColor[]): {
  centroid: RGB;
  variance: RGB;
  total: number;
} {
  let total = 0;
  const centroid: RGB = [0, 0, 0];
  for (const entry of colors) {
    total += entry.count;
    for (let c = 0; c < 3; c++) centroid[c]! += entry.color[c]! * entry.count;
  }
  for (let c = 0; c < 3; c++) centroid[c]! /= total || 1;
  const variance: RGB = [0, 0, 0];
  for (const entry of colors) {
    for (let c = 0; c < 3; c++)
      variance[c]! += (entry.color[c]! - centroid[c]!) ** 2 * entry.count;
  }
  variance[0] *= 0.3;
  variance[1] *= 0.59;
  variance[2] *= 0.11;
  return { centroid, variance, total };
}

/** One weighted palette for every direction and gait, including the outline. */
export function createPalette(
  frames: readonly ImageData[],
  settings: PixelSettings,
): RGB[] {
  const histogram = new Map<number, WeightedColor>();
  for (const frame of frames) {
    for (let i = 0; i < frame.data.length; i += 4) {
      if (!frame.data[i + 3]) continue;
      const color: RGB = [
        frame.data[i]!,
        frame.data[i + 1]!,
        frame.data[i + 2]!,
      ];
      const key = colorKey(...color);
      const existing = histogram.get(key);
      if (existing) existing.count++;
      else histogram.set(key, { color, count: 1 });
    }
  }
  const entries = [...histogram.values()];
  if (!entries.length)
    throw new Error(
      "モデルが画面に映っていません。拡大率・上下位置・向きを調整してください。",
    );
  const limit = Math.max(2, Math.min(255, Math.round(settings.colors)));
  const available = limit - (settings.outline ? 1 : 0);
  const boxes: WeightedColor[][] = [entries];
  while (boxes.length < available) {
    let candidate = -1;
    let splitChannel = 0;
    let greatestVariance = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i]!.length < 2) continue;
      const { variance } = summarize(boxes[i]!);
      for (let c = 0; c < 3; c++) {
        if (variance[c]! > greatestVariance) {
          candidate = i;
          splitChannel = c;
          greatestVariance = variance[c]!;
        }
      }
    }
    if (candidate < 0) break;
    const sorted = boxes[candidate]!.sort(
      (a, b) => a.color[splitChannel]! - b.color[splitChannel]!,
    );
    const total = summarize(sorted).total;
    let cumulative = 0;
    let split = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      cumulative += sorted[i]!.count;
      split = i + 1;
      if (cumulative >= total / 2) break;
    }
    boxes.splice(candidate, 1, sorted.slice(0, split), sorted.slice(split));
  }
  let palette = boxes.map(
    (box) => summarize(box).centroid.map(toRGB555) as RGB,
  );
  // Two weighted Lloyd iterations reduce seams while preserving one stable palette.
  for (let iteration = 0; iteration < 2; iteration++) {
    const groups: WeightedColor[][] = palette.map(() => []);
    for (const entry of entries) {
      let closest = 0;
      let distance = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const next = colorDistance(entry.color, palette[i]!);
        if (next < distance) {
          distance = next;
          closest = i;
        }
      }
      groups[closest]!.push(entry);
    }
    palette = groups.map((group, index) =>
      group.length
        ? (summarize(group).centroid.map(toRGB555) as RGB)
        : palette[index]!,
    );
  }
  if (settings.outline) palette.unshift([...OUTLINE]);
  const unique = new Map<number, RGB>();
  for (const rgb of palette) unique.set(colorKey(...rgb), rgb);
  return [...unique.values()].sort(
    (a, b) =>
      a[0] * 0.3 +
      a[1] * 0.59 +
      a[2] * 0.11 -
      (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11),
  );
}

export function applyPalette(
  source: ImageData,
  palette: readonly RGB[],
  settings: PixelSettings,
): ImageData {
  const data = new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const i = (y * FRAME_SIZE + x) * 4;
      if (!source.data[i + 3]) continue;
      // A small, screen-space ordered dither. Off by default for clean clusters.
      const dither = settings.dither
        ? (BAYER[(y % 4) * 4 + (x % 4)]! - 7.5) * 1.3
        : 0;
      const rgb: RGB = [
        source.data[i]! + dither,
        source.data[i + 1]! + dither,
        source.data[i + 2]! + dither,
      ];
      let nearest = palette[0]!;
      let distance = Infinity;
      for (const color of palette) {
        const next = colorDistance(rgb, color);
        if (next < distance) {
          distance = next;
          nearest = color;
        }
      }
      data.set([...nearest, 255], i);
    }
  }
  if (settings.outline) {
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const i = (y * FRAME_SIZE + x) * 4;
        if (source.data[i + 3]) continue;
        const adjacent =
          (x > 0 && source.data[i - 4 + 3]) ||
          (x < FRAME_SIZE - 1 && source.data[i + 4 + 3]) ||
          (y > 0 && source.data[i - FRAME_SIZE * 4 + 3]) ||
          (y < FRAME_SIZE - 1 && source.data[i + FRAME_SIZE * 4 + 3]);
        if (adjacent) data.set([...OUTLINE, 255], i);
      }
    }
  }
  return new ImageData(data, FRAME_SIZE, FRAME_SIZE);
}

export function touchesEdge(frame: ImageData): boolean {
  const { width, height, data } = frame;
  for (let x = 0; x < width; x++) {
    if (data[x * 4 + 3]! > 32 || data[((height - 1) * width + x) * 4 + 3]! > 32)
      return true;
  }
  for (let y = 0; y < height; y++) {
    if (
      data[y * width * 4 + 3]! > 32 ||
      data[(y * width + width - 1) * 4 + 3]! > 32
    )
      return true;
  }
  return false;
}

function createSheet(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function processFrames(
  raw: RawFrame[],
  settings: PixelSettings,
): SpriteResult {
  if (raw.length !== FRAME_COUNT)
    throw new Error(
      `48コマが必要です（取得: ${raw.length}コマ）。もう一度生成してください。`,
    );
  const lookup = new Map(
    raw.map((frame) => [
      `${frame.direction}/${frame.motion}/${frame.pose}`,
      frame,
    ]),
  );
  const ordered: RawFrame[] = [];
  for (const direction of DIRECTIONS) {
    for (const motion of MOTIONS) {
      for (const pose of [0, 1, 2] as const) {
        const frame = lookup.get(`${direction.id}/${motion}/${pose}`);
        if (!frame)
          throw new Error(
            `コマが不足しています: ${direction.id}/${motion}/${pose}`,
          );
        ordered.push(frame);
      }
    }
  }
  const sampled = ordered.map((frame) =>
    downsampleFrame(frame.pixels, settings),
  );
  const palette = createPalette(sampled, settings);
  const frames: SpriteFrame[] = ordered.map((frame, index) => ({
    ...frame,
    pixels: applyPalette(sampled[index]!, palette, settings),
    filename: `${frame.motion}/${frame.direction}/0${frame.pose}-${POSE_NAMES[frame.pose]}.png`,
  }));
  const sheet = createSheet(FRAME_SIZE * 6, FRAME_SIZE * 8);
  const walkSheet = createSheet(FRAME_SIZE * 3, FRAME_SIZE * 8);
  const runSheet = createSheet(FRAME_SIZE * 3, FRAME_SIZE * 8);
  const allContext = sheet.getContext("2d");
  const walkContext = walkSheet.getContext("2d");
  const runContext = runSheet.getContext("2d");
  if (!allContext || !walkContext || !runContext)
    throw new Error("画像を作成するためのCanvasが利用できません。");
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]!;
    const row = Math.floor(index / 6);
    const column = index % 6;
    allContext.putImageData(
      frame.pixels,
      column * FRAME_SIZE,
      row * FRAME_SIZE,
    );
    (frame.motion === "walk" ? walkContext : runContext).putImageData(
      frame.pixels,
      frame.pose * FRAME_SIZE,
      row * FRAME_SIZE,
    );
  }
  return {
    frames,
    palette,
    sheet,
    walkSheet,
    runSheet,
    clippedFrames: frames.filter(
      (frame, index) =>
        touchesEdge(frame.pixels) || touchesEdge(ordered[index]!.pixels),
    ).length,
  };
}
