import { AvatarRenderer } from "./renderer";
import { processFrames } from "./pixel";
import {
  DEFAULT_PIXEL_SETTINGS,
  DEFAULT_RENDER_SETTINGS,
  type ModelInfo,
  type PixelSettings,
  type ProgressCallback,
  type RawFrame,
  type RenderSettings,
  type SpriteResult,
} from "./types";

/** The conversion engine used by the Web UI, Web API and local CLI. */
export class SpriteEngine {
  private readonly renderer: AvatarRenderer;

  constructor(canvas = document.createElement("canvas")) {
    this.renderer = new AvatarRenderer(canvas);
  }

  load(buffer: ArrayBuffer, filename: string): Promise<ModelInfo> {
    return this.renderer.load(buffer, filename);
  }

  /** Reuse captured frames when only the palette or pixel settings change. */
  process(rawFrames: RawFrame[], settings: PixelSettings): SpriteResult {
    return processFrames(rawFrames, settings);
  }

  async generate(
    renderSettings: RenderSettings = { ...DEFAULT_RENDER_SETTINGS },
    pixelSettings: PixelSettings = { ...DEFAULT_PIXEL_SETTINGS },
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<{ rawFrames: RawFrame[]; sprites: SpriteResult }> {
    const rawFrames = await this.renderer.capture(renderSettings, onProgress, signal);
    return { rawFrames, sprites: this.process(rawFrames, pixelSettings) };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
