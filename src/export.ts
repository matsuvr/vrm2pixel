import { strToU8, zipSync } from "fflate";
import {
  DIRECTIONS,
  FRAME_SIZE,
  GROUND_PIXEL,
  MOTIONS,
  POSE_LABELS,
  POSE_NAMES,
  type ModelInfo,
  type PixelSettings,
  type RenderSettings,
  type SpriteFrame,
  type SpriteResult,
} from "./types";

export function safeBaseName(value: string): string {
  const cleaned = value
    .replace(/\.(vrm|glb)$/i, "")
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || "vrm-sprites";
}

export function opaqueBounds(
  frame: SpriteFrame,
): { x: number; y: number; width: number; height: number } | null {
  let left = FRAME_SIZE;
  let top = FRAME_SIZE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      if (!frame.pixels.data[(y * FRAME_SIZE + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function buildMetadata(
  result: SpriteResult,
  renderSettings: RenderSettings,
  pixelSettings: PixelSettings,
  modelInfo: ModelInfo,
) {
  const bounds = result.frames.map(opaqueBounds);
  const baseline = GROUND_PIXEL + renderSettings.groundOffset;
  return {
    format: "vrm-pixel-studio",
    version: 1,
    generatedAt: new Date().toISOString(),
    model: {
      name: modelInfo.name,
      vrmVersion: modelInfo.version,
      author: modelInfo.author,
    },
    frameSize: { width: FRAME_SIZE, height: FRAME_SIZE },
    frameCount: result.frames.length,
    coordinateSystem:
      "top-left origin; x right; y down; pixel-edge coordinates",
    anchor: { x: FRAME_SIZE / 2, y: baseline },
    baseline,
    anchorDescription:
      "Fixed world-ground origin projected by the shared orthographic camera. Individual frame bounds do not change this pivot.",
    sheets: {
      all: {
        file: "spritesheet.png",
        width: FRAME_SIZE * 6,
        height: FRAME_SIZE * 8,
        columns: 6,
        rows: 8,
      },
      walk: { file: "walk.png", width: FRAME_SIZE * 3, height: FRAME_SIZE * 8, columns: 3, rows: 8 },
      run: { file: "run.png", width: FRAME_SIZE * 3, height: FRAME_SIZE * 8, columns: 3, rows: 8 },
    },
    directions: DIRECTIONS.map((direction, row) => ({
      id: direction.id,
      label: direction.label,
      arrow: direction.arrow,
      row,
      yawDegrees: direction.yaw,
    })),
    poses: POSE_NAMES.map((name, index) => ({
      index,
      name,
      label: POSE_LABELS[index],
    })),
    footConvention:
      "right/left refer to the avatar’s anatomical right/left, not screen right/left",
    palette: {
      colorSpace: "sRGB",
      channelBits: 5,
      opaqueColorCount: result.palette.length,
      requestedOpaqueColors: pixelSettings.colors,
      transparentAlpha: 0,
      opaqueAlpha: 255,
      colors: result.palette.map((color) => [...color]),
    },
    settings: { render: { ...renderSettings }, pixel: { ...pixelSettings } },
    clippedFrames: result.clippedFrames,
    warnings: [...modelInfo.warnings],
    frames: result.frames.map((frame, index) => {
      const row = DIRECTIONS.findIndex(
        (direction) => direction.id === frame.direction,
      );
      const column = frame.pose + (frame.motion === "run" ? 3 : 0);
      return {
        id: `${frame.motion}/${frame.direction}/${POSE_NAMES[frame.pose]}`,
        file: `frames/${frame.filename}`,
        direction: frame.direction,
        motion: frame.motion,
        pose: frame.pose,
        sheet: {
          x: column * FRAME_SIZE,
          y: row * FRAME_SIZE,
          width: FRAME_SIZE,
          height: FRAME_SIZE,
        },
        motionSheet: {
          x: frame.pose * FRAME_SIZE,
          y: row * FRAME_SIZE,
          width: FRAME_SIZE,
          height: FRAME_SIZE,
        },
        opaqueBounds: bounds[index],
        anchor: { x: FRAME_SIZE / 2, y: baseline },
      };
    }),
    animations: Object.fromEntries(
      MOTIONS.flatMap((motion) =>
        DIRECTIONS.map((direction) => [
          `${motion}/${direction.id}`,
          {
            loop: true,
            poseSequence: [1, 0, 2, 0],
            frameSequence: [1, 0, 2, 0].map(
              (pose) => `${motion}/${direction.id}/${POSE_NAMES[pose]}`,
            ),
            frameDurationMs: motion === "walk" ? 150 : 90,
          },
        ]),
      ),
    ),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(
          new Error("PNGの書き出しに失敗しました。もう一度お試しください。"),
        );
    }, "image/png");
  });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the URL alive while the browser's download manager opens it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadSheet(
  result: SpriteResult,
  kind: "all" | "walk" | "run",
  baseName: string,
): Promise<void> {
  const canvas =
    kind === "all"
      ? result.sheet
      : kind === "walk"
        ? result.walkSheet
        : result.runSheet;
  download(
    await canvasBlob(canvas),
    `${safeBaseName(baseName)}-${kind === "all" ? "spritesheet" : kind}.png`,
  );
}

export async function createBundle(
  result: SpriteResult,
  renderSettings: RenderSettings,
  pixelSettings: PixelSettings,
  modelInfo: ModelInfo,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const sheets = [
    ["spritesheet.png", result.sheet],
    ["walk.png", result.walkSheet],
    ["run.png", result.runSheet],
  ] as const;
  for (const [name, canvas] of sheets)
    files[name] = new Uint8Array(
      await (await canvasBlob(canvas)).arrayBuffer(),
    );
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNGを書き出すためのCanvasが利用できません。");
  for (const frame of result.frames) {
    context.putImageData(frame.pixels, 0, 0);
    files[`frames/${frame.filename}`] = new Uint8Array(
      await (await canvasBlob(canvas)).arrayBuffer(),
    );
  }
  files["metadata.json"] = strToU8(
    JSON.stringify(
      buildMetadata(result, renderSettings, pixelSettings, modelInfo),
      null,
      2,
    ),
  );
  files["README.txt"] = strToU8(
    `VRM PIXEL STUDIO — スプライト出力\n\n` +
      `1コマ: ${FRAME_SIZE}×${FRAME_SIZE}px / 背景透過 / 48コマ / 全コマ共通パレット\n\n` +
      `spritesheet.png: ${FRAME_SIZE * 6}×${FRAME_SIZE * 8}px（6列×8行）\n` +
      `列: 歩き・標準 / 歩き・右足 / 歩き・左足 / 走り・標準 / 走り・右足 / 走り・左足\n` +
      `行: 下 / 左下 / 左 / 左上 / 上 / 右上 / 右 / 右下\n\n` +
      `walk.png と run.png: 各${FRAME_SIZE * 3}×${FRAME_SIZE * 8}px（3列×8行）\n` +
      `列: 標準 / 右足 / 左足\n` +
      `frames/: 48枚の個別PNG（motion/direction/pose.png）\n` +
      `metadata.json: 各コマの座標、方向、共通ピボット、色、設定、推奨再生順\n\n` +
      `右足・左足はモデル本人から見た解剖学的な右・左を指します。\n` +
      `再生順: 右足→標準→左足→標準（列インデックス 1, 0, 2, 0）をループ。\n` +
      `目安: 歩きは各150ms、走りは各90ms。標準コマは2回参照し、画像は3枚です。\n` +
      `ピボット: 全48コマ共通の地面原点（x=${FRAME_SIZE / 2}、y=${GROUND_PIXEL}＋上下位置）。座標は左上原点です。\n` +
      `各コマは${FRAME_SIZE}×${FRAME_SIZE}pxのまま共通ピボットで配置してください。コマごとのトリミングは禁止です。\n` +
      `拡大表示にはニアレストネイバー（最近傍）を使用してください。\n\n` +
      `これは3Dモデルからの自動ポーズ生成・減色結果です。VRMに固有の衣装や髪型は\n` +
      `そのまま反映されるため、モデルによって歩幅や撮影設定の調整が必要です。\n` +
      `出力画像の利用条件は元のVRMモデルの利用条件に従います。\n`,
  );
  return zipSync(files, { level: 6 });
}

export async function downloadBundle(
  result: SpriteResult,
  baseName: string,
  renderSettings: RenderSettings,
  pixelSettings: PixelSettings,
  modelInfo: ModelInfo,
): Promise<void> {
  const bytes = await createBundle(
    result,
    renderSettings,
    pixelSettings,
    modelInfo,
  );
  download(
    new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
    `${safeBaseName(baseName)}-sprites.zip`,
  );
}
