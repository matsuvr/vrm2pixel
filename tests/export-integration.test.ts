import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createCanvas,
  ImageData as NativeImageData,
  loadImage,
} from "@napi-rs/canvas";
import { strFromU8, unzipSync } from "fflate";
import { createBundle } from "../src/export";
import { processFrames, toRGB555 } from "../src/pixel";
import {
  DEFAULT_PIXEL_SETTINGS,
  DEFAULT_RENDER_SETTINGS,
  DIRECTIONS,
  MOTIONS,
  type RawFrame,
} from "../src/types";

/**
 * Actual Skia 2D canvases and PNG encoders, not a mocked image pipeline.
 * Only document.createElement is adapted; browser-only WebGL is not involved.
 */
function installCanvasDocument(): () => void {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const previousImageData = Object.getOwnPropertyDescriptor(
    globalThis,
    "ImageData",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag: string) {
        assert.equal(
          tag,
          "canvas",
          "This test adapter only creates 2D canvases",
        );
        return createCanvas(1, 1);
      },
    },
  });
  Object.defineProperty(globalThis, "ImageData", {
    configurable: true,
    value: NativeImageData,
  });
  return () => {
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousImageData)
      Object.defineProperty(globalThis, "ImageData", previousImageData);
    else Reflect.deleteProperty(globalThis, "ImageData");
  };
}

function syntheticFrame(index: number): ImageData {
  const width = 256;
  const pixels = new Uint8ClampedArray(width * width * 4);
  const colors = [
    [53, 186, 156],
    [251, 193, 132],
    [63, 83, 124],
  ] as const;
  // The six-bit cutout pattern is unique for each of the 48 frames. Each hole
  // is three pixels wide, so its center survives the one-pixel outline.
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const px = Math.floor(x / 4);
      const py = Math.floor(y / 4);
      if (px < 3 || px > 60 || py < 4 || py > 59) continue;
      const bit = Math.floor((px - 3) / 4);
      const inCutout =
        py >= 12 &&
        py <= 14 &&
        (px - 3) % 4 < 3 &&
        bit < 6 &&
        (index & (1 << bit)) !== 0;
      if (inCutout) continue;
      const color = colors[(index + (py < 10 ? 1 : 0)) % colors.length]!;
      const offset = (y * width + x) * 4;
      pixels.set([...color, px === 8 && py === 8 ? 170 : 255], offset);
    }
  }
  return new ImageData(pixels, width, width);
}

async function decodePNG(bytes: Uint8Array) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "The ZIP entry must be an actual PNG",
  );
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixels: context.getImageData(0, 0, image.width, image.height),
  };
}

function cropBytes(
  pixels: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(64 * 64 * 4);
  for (let row = 0; row < 64; row++) {
    const start = ((y + row) * pixels.width + x) * 4;
    result.set(pixels.data.subarray(start, start + 64 * 4), row * 64 * 4);
  }
  return result;
}

test("real PNG/ZIP export preserves all 48 cells, dimensions, transparency, shared colors and metadata", async (context) => {
  const restore = installCanvasDocument();
  context.after(restore);
  const raw: RawFrame[] = [];
  for (const direction of DIRECTIONS) {
    for (const motion of MOTIONS) {
      for (const pose of [0, 1, 2] as const) {
        raw.push({
          direction: direction.id,
          motion,
          pose,
          pixels: syntheticFrame(raw.length),
        });
      }
    }
  }
  const pixelSettings = {
    ...DEFAULT_PIXEL_SETTINGS,
    colors: 15,
    contrast: 1.12,
    saturation: 1.06,
  };
  const renderSettings = {
    ...DEFAULT_RENDER_SETTINGS,
    headScale: 1.4,
    cameraElevation: 13,
    groundOffset: -1,
    facingOffset: 90,
  };
  const modelInfo = {
    name: "書き出しテスト",
    author: "Original synthetic fixture",
    version: "VRM 1.0",
    warnings: [],
  };
  // Captures need not arrive in sheet order; metadata and PNG placement must
  // still use the documented direction/motion/pose order.
  const result = processFrames([...raw].reverse(), pixelSettings);
  const archive = await createBundle(
    result,
    renderSettings,
    pixelSettings,
    modelInfo,
  );
  const files = unzipSync(archive);
  assert.equal(
    Object.keys(files).length,
    53,
    "48 PNG frames + three sheets + metadata + README",
  );
  assert.equal(
    Object.keys(files).filter((name) => name.startsWith("frames/")).length,
    48,
  );
  assert.ok(files["README.txt"]);
  assert.match(strFromU8(files["README.txt"]!), /64×64px/);
  assert.match(strFromU8(files["README.txt"]!), /384×512px/);
  assert.match(strFromU8(files["README.txt"]!), /右足→標準→左足→標準/);

  const all = await decodePNG(files["spritesheet.png"]!);
  const walk = await decodePNG(files["walk.png"]!);
  const run = await decodePNG(files["run.png"]!);
  assert.deepEqual([all.width, all.height], [384, 512]);
  assert.deepEqual([walk.width, walk.height], [192, 512]);
  assert.deepEqual([run.width, run.height], [192, 512]);

  const metadata = JSON.parse(strFromU8(files["metadata.json"]!));
  assert.equal(metadata.frameCount, 48);
  assert.deepEqual(metadata.frameSize, { width: 64, height: 64 });
  assert.deepEqual([metadata.sheets.all.width, metadata.sheets.all.height], [384, 512]);
  assert.deepEqual([metadata.sheets.walk.width, metadata.sheets.walk.height], [192, 512]);
  assert.deepEqual([metadata.sheets.run.width, metadata.sheets.run.height], [192, 512]);
  assert.deepEqual(metadata.settings, {
    render: renderSettings,
    pixel: pixelSettings,
  });
  assert.deepEqual(metadata.model, {
    name: modelInfo.name,
    vrmVersion: modelInfo.version,
    author: modelInfo.author,
  });
  assert.deepEqual(metadata.anchor, { x: 32, y: 59 });
  assert.equal(Object.keys(metadata.animations).length, 16);
  assert.deepEqual(metadata.animations["walk/down"].poseSequence, [1, 0, 2, 0]);
  assert.deepEqual(metadata.animations["run/up"].poseSequence, [1, 0, 2, 0]);
  assert.equal(metadata.animations["walk/down"].frameDurationMs, 150);
  assert.equal(metadata.animations["run/up"].frameDurationMs, 90);

  const allowedColors = new Set(result.palette.map((rgb) => rgb.join(",")));
  const actualColors = new Set<string>();
  const frameHashes = new Set<string>();
  assert.ok(allowedColors.size <= 15);
  assert.deepEqual(metadata.palette.colors, result.palette);
  let transparentPixels = 0;
  let opaquePixels = 0;
  for (let index = 0; index < 48; index++) {
    const frame = result.frames[index]!;
    const path = `frames/${frame.filename}`;
    assert.ok(files[path], `Missing individual frame: ${path}`);
    const decoded = await decodePNG(files[path]!);
    assert.deepEqual([decoded.width, decoded.height], [64, 64]);
    assert.deepEqual(
      decoded.pixels.data,
      frame.pixels.data,
      "PNG encoding must preserve every RGBA pixel",
    );
    const row = Math.floor(index / 6);
    const column = index % 6;
    assert.deepEqual(
      cropBytes(all.pixels, column * 64, row * 64),
      frame.pixels.data,
      "The all-motion sheet cell must match its individual PNG",
    );
    const motionSheet = frame.motion === "walk" ? walk : run;
    assert.deepEqual(
      cropBytes(motionSheet.pixels, frame.pose * 64, row * 64),
      frame.pixels.data,
      "The motion sheet cell must match its individual PNG",
    );
    assert.equal(metadata.frames[index].file, path);
    assert.deepEqual(metadata.frames[index].sheet, {
      x: column * 64,
      y: row * 64,
      width: 64,
      height: 64,
    });
    assert.deepEqual(metadata.frames[index].motionSheet, {
      x: frame.pose * 64,
      y: row * 64,
      width: 64,
      height: 64,
    });
    assert.deepEqual(metadata.frames[index].anchor, { x: 32, y: 59 });
    assert.equal(metadata.frames[index].direction, DIRECTIONS[row]!.id);
    assert.equal(metadata.frames[index].motion, column < 3 ? "walk" : "run");
    assert.equal(metadata.frames[index].pose, column % 3);
    frameHashes.add(
      createHash("sha256").update(decoded.pixels.data).digest("hex"),
    );

    for (let offset = 0; offset < decoded.pixels.data.length; offset += 4) {
      const rgba = decoded.pixels.data.subarray(offset, offset + 4);
      assert.ok(
        rgba[3] === 0 || rgba[3] === 255,
        "Exported alpha must be binary",
      );
      if (rgba[3] === 0) {
        transparentPixels++;
        continue;
      }
      opaquePixels++;
      const rgb = [rgba[0]!, rgba[1]!, rgba[2]!];
      assert.ok(
        allowedColors.has(rgb.join(",")),
        "All individual PNGs must use the same palette",
      );
      rgb.forEach((value) =>
        assert.equal(
          value,
          toRGB555(value),
          "Each channel must be RGB555-quantized",
        ),
      );
      actualColors.add(rgb.join(","));
    }
  }
  assert.equal(
    frameHashes.size,
    48,
    "No direction or pose may accidentally reuse another frame",
  );
  assert.ok(transparentPixels > 0 && opaquePixels > 0);
  assert.ok(actualColors.size <= 15);
});
