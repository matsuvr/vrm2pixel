import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPalette,
  createPalette,
  downsampleFrame,
  processFrames,
  touchesEdge,
  toRGB555,
} from "../src/pixel";
import { buildMetadata, safeBaseName } from "../src/export";
import {
  DEFAULT_PIXEL_SETTINGS,
  DEFAULT_RENDER_SETTINGS,
  DIRECTIONS,
  MOTIONS,
  type SpriteFrame,
  type SpriteResult,
} from "../src/types";

// Pixel algorithms need only ImageData's byte container. Canvas compositing is
// exercised in the browser; no browser implementation is re-created here.
class TestImageData {
  readonly colorSpace = "srgb";
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}
Object.defineProperty(globalThis, "ImageData", {
  value: TestImageData,
  configurable: true,
});

function image(size = 64): ImageData {
  return new ImageData(new Uint8ClampedArray(size * size * 4), size, size);
}

function put(frame: ImageData, x: number, y: number, color: readonly number[]) {
  frame.data.set(color, (y * frame.width + x) * 4);
}

test("coverage sampling excludes transparent black and produces binary alpha", () => {
  const source = image(256);
  // A 50%-covered pixel: 8 opaque red source samples plus 8 transparent samples.
  for (let y = 40; y < 44; y++)
    for (let x = 40; x < 42; x++) put(source, x, y, [255, 0, 0, 255]);
  const sampled = downsampleFrame(source, {
    ...DEFAULT_PIXEL_SETTINGS,
    contrast: 1,
    saturation: 1,
  });
  assert.deepEqual(
    [...sampled.data.slice((10 * 64 + 10) * 4, (10 * 64 + 10) * 4 + 4)],
    [255, 0, 0, 255],
  );
  assert.deepEqual(
    new Set([...sampled.data].filter((_, index) => index % 4 === 3)),
    new Set([0, 255]),
  );
  assert.equal(sampled.width, 64);
  assert.equal(sampled.height, 64);
});

test("48 frames share one bounded RGB555 palette including one-pixel outline", () => {
  const settings = { ...DEFAULT_PIXEL_SETTINGS, contrast: 1, saturation: 1 };
  const frames = Array.from({ length: 48 }, (_, index) => {
    const frame = image();
    for (let y = 5; y < 26; y++) {
      for (let x = 10; x < 22; x++) {
        put(frame, x, y, [
          toRGB555(index * 5),
          toRGB555(y * 9),
          toRGB555(x * 10),
          255,
        ]);
      }
    }
    return frame;
  });
  const palette = createPalette(frames, settings);
  assert.ok(palette.length <= 15);
  const keys = new Set(palette.map((rgb) => rgb.join(",")));
  for (const rgb of palette)
    for (const channel of rgb) assert.equal(toRGB555(channel), channel);
  for (const frame of frames) {
    const output = applyPalette(frame, palette, settings);
    for (let i = 0; i < output.data.length; i += 4) {
      assert.ok(output.data[i + 3] === 0 || output.data[i + 3] === 255);
      if (output.data[i + 3])
        assert.ok(keys.has([...output.data.slice(i, i + 3)].join(",")));
    }
    assert.equal(output.data[(4 * 64 + 10) * 4 + 3], 255, "top outline exists");
    assert.equal(
      output.data[(3 * 64 + 10) * 4 + 3],
      0,
      "outline stays one pixel thick",
    );
    assert.equal(touchesEdge(output), false);
  }
});

test("dither is deterministic and never changes the silhouette or palette", () => {
  const source = image();
  for (let y = 4; y < 28; y++)
    for (let x = 4; x < 28; x++) put(source, x, y, [124, 124, 124, 255]);
  const palette: [number, number, number][] = [
    [99, 99, 99],
    [148, 148, 148],
  ];
  const settings = { ...DEFAULT_PIXEL_SETTINGS, outline: false, dither: true };
  const first = applyPalette(source, palette, settings);
  const second = applyPalette(source, palette, settings);
  assert.deepEqual(first.data, second.data);
  for (let i = 3; i < source.data.length; i += 4)
    assert.equal(first.data[i], source.data[i]);
});

test("bad frame sets fail instead of silently producing incomplete sheets", () => {
  assert.throws(() => processFrames([], DEFAULT_PIXEL_SETTINGS), /48/);
  const one = {
    direction: "down" as const,
    motion: "walk" as const,
    pose: 0 as const,
    pixels: image(),
  };
  assert.throws(
    () =>
      processFrames(
        Array.from({ length: 48 }, () => one),
        DEFAULT_PIXEL_SETTINGS,
      ),
    /不足/,
  );
  assert.throws(
    () => createPalette([image()], DEFAULT_PIXEL_SETTINGS),
    /映っていません/,
  );
});

test("metadata maps all 48 cells correctly and gives every frame one fixed pivot", () => {
  const frames: SpriteFrame[] = DIRECTIONS.flatMap((direction) =>
    MOTIONS.flatMap((motion) =>
      ([0, 1, 2] as const).map((pose) => ({
        direction: direction.id,
        motion,
        pose,
        pixels: image(),
        filename: `${motion}/${direction.id}/${pose}.png`,
      })),
    ),
  );
  const result = {
    frames,
    palette: [[16, 16, 33]],
    clippedFrames: 0,
  } as SpriteResult;
  const metadata = buildMetadata(
    result,
    { ...DEFAULT_RENDER_SETTINGS, groundOffset: -1 },
    DEFAULT_PIXEL_SETTINGS,
    { name: "test", version: "1.0", author: "test", warnings: [] },
  );
  assert.equal(metadata.frames.length, 48);
  assert.equal(
    new Set(metadata.frames.map((frame) => `${frame.sheet.x}/${frame.sheet.y}`))
      .size,
    48,
  );
  assert.deepEqual(metadata.frames[0]!.sheet, {
    x: 0,
    y: 0,
    width: 64,
    height: 64,
  });
  assert.deepEqual(metadata.frames[47]!.sheet, {
    x: 320,
    y: 448,
    width: 64,
    height: 64,
  });
  assert.deepEqual(metadata.frames[47]!.motionSheet, {
    x: 128,
    y: 448,
    width: 64,
    height: 64,
  });
  for (const frame of metadata.frames)
    assert.deepEqual(frame.anchor, { x: 32, y: 59 });
  assert.equal(Object.keys(metadata.animations).length, 16);
  assert.deepEqual(
    metadata.animations["walk/down"]!.poseSequence,
    [1, 0, 2, 0],
  );
});

test("output filenames retain Japanese names and remove OS path delimiters", () => {
  assert.equal(safeBaseName("サンプル.vrm"), "サンプル");
  assert.equal(safeBaseName("folder/avatar:demo.vrm"), "folder-avatar-demo");
  assert.equal(safeBaseName("   "), "vrm-sprites");
});
