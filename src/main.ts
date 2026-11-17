import "./style.css";
import { SpriteEngine } from "./engine";
import { downloadBundle, downloadSheet } from "./export";
import {
  DEFAULT_PIXEL_SETTINGS,
  DEFAULT_RENDER_SETTINGS,
  DIRECTIONS,
  POSE_LABELS,
  type DirectionId,
  type ModelInfo,
  type Motion,
  type PixelSettings,
  type PoseIndex,
  type RawFrame,
  type RenderSettings,
  type SpriteResult,
} from "./types";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`UI element missing: ${id}`);
  return node as T;
}
const input = (id: string) => element<HTMLInputElement>(id);
const number = (id: string) => Number(input(id).value);
const generateButton = element<HTMLButtonElement>("generate");
const sheetCanvas = element<HTMLCanvasElement>("sheet-canvas");
const previewCanvas = element<HTMLCanvasElement>("preview-canvas");
const status = element<HTMLParagraphElement>("status");
const errorBox = element<HTMLDivElement>("error-message");
const warningBox = element<HTMLDivElement>("warning-message");
const exportIds = [
  "download-sheet",
  "download-walk",
  "download-run",
  "download-zip",
];
const pixelIds = ["colors", "outline", "dither", "contrast", "saturation"];
const renderIds = [
  "head-scale",
  "motion-strength",
  "camera-elevation",
  "scale",
  "ground-offset",
  "facing-offset",
];

let engine: SpriteEngine | undefined;
let model: ModelInfo | undefined;
let rawFrames: RawFrame[] = [];
let sprites: SpriteResult | undefined;
let renderedSettings = { ...DEFAULT_RENDER_SETTINGS };
let baseName = "mint";
let direction: DirectionId = "down";
let motion: Motion = "walk";
let selectedPose: PoseIndex = 0;
let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let animationStep = 0;
let previousTime = 0;
let paintKey = "";
let busy: "loading" | "rendering" | "exporting" | null = null;
let dirty = false;
let abortController: AbortController | undefined;
let pixelTimer: ReturnType<typeof setTimeout> | undefined;

function pixelSettings(): PixelSettings {
  return {
    colors: number("colors"),
    outline: input("outline").checked,
    dither: input("dither").checked,
    contrast: number("contrast") / 100,
    saturation: number("saturation") / 100,
  };
}

function renderSettings(): RenderSettings {
  return {
    cameraElevation: number("camera-elevation"),
    scale: number("scale") / 100,
    groundOffset: number("ground-offset"),
    facingOffset: number("facing-offset"),
    motionStrength: number("motion-strength") / 100,
    headScale: number("head-scale") / 100,
  };
}

function updateLabels(): void {
  for (const id of ["contrast", "saturation", "motion-strength", "scale"])
    element(`${id}-value`).textContent = `${number(id)}%`;
  element("head-scale-value").textContent =
    `${(number("head-scale") / 100).toFixed(2)}×`;
  element("camera-elevation-value").textContent =
    `${number("camera-elevation")}°`;
  element("ground-offset-value").textContent =
    `${number("ground-offset") > 0 ? "+" : ""}${number("ground-offset")}px`;
}

function updateButtons(): void {
  document
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >(".controls input, .controls select, .controls button")
    .forEach((node) => {
      if (node.id !== "generate") node.disabled = Boolean(busy);
    });
  generateButton.disabled =
    !model || busy === "loading" || busy === "exporting";
  generateButton.firstElementChild!.textContent =
    busy === "rendering" ? "生成を中止" : "48コマを生成";
  for (const id of exportIds)
    element<HTMLButtonElement>(id).disabled =
      Boolean(busy) || dirty || !sprites;
}

function setBusy(value: typeof busy): void {
  busy = value;
  updateButtons();
}
function setStatus(message: string, percent?: number): void {
  status.textContent = message;
  if (percent !== undefined)
    element("progress-bar").style.width =
      `${Math.min(100, Math.max(0, percent))}%`;
}
function reportError(error: unknown): void {
  errorBox.textContent = error instanceof Error ? error.message : String(error);
  errorBox.hidden = false;
}
function clearError(): void {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function updateWarnings(): void {
  const warnings = [...(model?.warnings ?? [])];
  if (sprites && sprites.clippedFrames > 0)
    warnings.push(
      `${sprites.clippedFrames}コマが画像の端に触れています。「画像内の大きさ」を下げるか、上下位置を調整して再生成してください。`,
    );
  warningBox.textContent = warnings.join("\n");
  warningBox.hidden = warnings.length === 0;
}

function paint(canvas: HTMLCanvasElement, source: ImageData): void {
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")!.putImageData(source, 0, 0);
}

function updateSelection(): void {
  const directionInfo = DIRECTIONS.find((value) => value.id === direction)!;
  element("preview-label").textContent =
    `${directionInfo.label}向き / ${motion === "walk" ? "歩き" : "走り"}${playing ? "" : ` / ${POSE_LABELS[selectedPose]}`}`;
  document
    .querySelectorAll<HTMLButtonElement>("[data-direction]")
    .forEach((button) => {
      const active = button.dataset.direction === direction;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  element("row-highlight").style.top =
    `${DIRECTIONS.findIndex((value) => value.id === direction) * 12.5}%`;
  for (const item of ["walk", "run"] as const) {
    const button = element<HTMLButtonElement>(`motion-${item}`);
    button.classList.toggle("active", motion === item);
    button.setAttribute("aria-pressed", String(motion === item));
  }
  const toggle = element<HTMLButtonElement>("play-toggle");
  toggle.textContent = playing ? "Ⅱ" : "▶";
  toggle.setAttribute("aria-label", playing ? "一時停止" : "再生");
  document
    .querySelectorAll<HTMLButtonElement>("[data-pose]")
    .forEach((button) => {
      const pose = Number(button.dataset.pose) as PoseIndex;
      const frame = sprites?.frames.find(
        (value) =>
          value.direction === direction &&
          value.motion === motion &&
          value.pose === pose,
      );
      if (frame) paint(button.querySelector("canvas")!, frame.pixels);
      button.classList.toggle("active", !playing && selectedPose === pose);
      button.setAttribute(
        "aria-pressed",
        String(!playing && selectedPose === pose),
      );
    });
  paintKey = "";
  paintPreview();
}

function paintPreview(): void {
  if (!sprites) return;
  const pose = playing
    ? ([1, 0, 2, 0][animationStep % 4] as PoseIndex)
    : selectedPose;
  const key = `${direction}/${motion}/${pose}`;
  if (paintKey === key) return;
  const frame = sprites.frames.find(
    (value) =>
      value.direction === direction &&
      value.motion === motion &&
      value.pose === pose,
  );
  if (frame) paint(previewCanvas, frame.pixels);
  paintKey = key;
}

function displaySprites(): void {
  if (!sprites) return;
  const context = sheetCanvas.getContext("2d")!;
  context.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(sprites.sheet, 0, 0);
  const palette = element("palette");
  palette.replaceChildren();
  for (const [r, g, b] of sprites.palette) {
    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    swatch.title = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    palette.append(swatch);
  }
  element("palette-count").textContent = `${sprites.palette.length}色 ＋ 透明`;
  updateSelection();
  updateWarnings();
  updateButtons();
}

function refreshPixels(): void {
  if (!engine || rawFrames.length !== 48) return;
  try {
    sprites = engine.process(rawFrames, pixelSettings());
    displaySprites();
    if (!dirty) setStatus("48 / 48 コマ完成。PNG・ZIPを保存できます。", 100);
  } catch (error) {
    reportError(error);
  }
}

async function generate(): Promise<void> {
  if (!engine || !model || busy) return;
  clearTimeout(pixelTimer);
  clearError();
  setBusy("rendering");
  setStatus("全方向・全ポーズに収まる構図を計算中…", 0);
  abortController = new AbortController();
  const settings = renderSettings();
  try {
    const generated = await engine.generate(
      settings,
      pixelSettings(),
      (current, total) => {
        setStatus(
          `${current} / ${total} コマを描画中…`,
          (current / total) * 94,
        );
      },
      abortController.signal,
    );
    // Commit frames and settings together, so metadata always describes the PNG.
    rawFrames = generated.rawFrames;
    renderedSettings = { ...settings };
    sprites = generated.sprites;
    dirty = false;
    displaySprites();
    setStatus("48 / 48 コマ完成。PNG・ZIPを保存できます。", 100);
  } catch (error) {
    if (abortController.signal.aborted)
      setStatus("生成を中止しました。設定を調整して再生成できます。", 0);
    else {
      reportError(error);
      setStatus("生成できませんでした。設定を確認して再試行してください。", 0);
    }
  } finally {
    abortController = undefined;
    setBusy(null);
  }
}

async function loadModel(
  buffer: ArrayBuffer,
  filename: string,
  demo = false,
): Promise<void> {
  clearError();
  setBusy("loading");
  setStatus("VRMのモデル・ボーン・テクスチャを読み込み中…", 0);
  try {
    engine ??= new SpriteEngine();
    const info = await engine.load(buffer, filename);
    model = info;
    rawFrames = [];
    sprites = undefined;
    dirty = true;
    baseName = demo ? "mint" : filename.replace(/\.vrm$/i, "");
    element("model-name").textContent =
      `${demo ? "DEMO · " : ""}${info.name || filename}`;
    element("model-name").title = filename;
    element("model-version").textContent =
      `${info.version}${demo ? " / オリジナルサンプル" : ""}`;
    sheetCanvas.getContext("2d")!.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    previewCanvas.getContext("2d")!.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    document
      .querySelectorAll<HTMLCanvasElement>("#pose-strip canvas")
      .forEach((canvas) => canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height));
    element("palette").replaceChildren();
    element("palette-count").textContent = "—";
    updateWarnings();
  } catch (error) {
    reportError(error);
    if (!model) {
      element("model-name").textContent = "モデル未読み込み";
      element("model-version").textContent = "VRM 0.x / 1.0";
    }
    setStatus("読み込めませんでした。別のVRMを選択してください。", 0);
    setBusy(null);
    return;
  }
  setBusy(null);
  await generate();
}

async function loadFile(file: File): Promise<void> {
  if (busy) return;
  if (!/\.vrm$/i.test(file.name)) {
    reportError(new Error(".vrm形式のファイルを選択してください。"));
    return;
  }
  setBusy("loading");
  try {
    await loadModel(await file.arrayBuffer(), file.name);
  } catch (error) {
    reportError(error);
    setBusy(null);
  }
}

async function loadDemo(): Promise<void> {
  if (busy) return;
  setBusy("loading");
  clearError();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}demo.vrm`);
    if (!response.ok)
      throw new Error(
        "デモモデルを読み込めません。VRMファイルを選択して開始してください。",
      );
    await loadModel(await response.arrayBuffer(), "Mint.vrm", true);
  } catch (error) {
    reportError(error);
    setStatus("VRMファイルを選択して開始してください。", 0);
    setBusy(null);
  }
}

const rowLabels = element("row-labels");
for (const item of DIRECTIONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.direction = item.id;
  button.setAttribute("aria-label", `${item.label}向き`);
  const arrow = document.createElement("span");
  arrow.textContent = item.arrow;
  button.append(arrow, document.createTextNode(item.label));
  rowLabels.append(button);
}
document
  .querySelectorAll<HTMLButtonElement>("[data-direction]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      direction = button.dataset.direction as DirectionId;
      animationStep = 0;
      previousTime = 0;
      updateSelection();
    }),
  );
for (const item of ["walk", "run"] as const)
  element(`motion-${item}`).addEventListener("click", () => {
    motion = item;
    animationStep = 0;
    previousTime = 0;
    updateSelection();
  });
element("play-toggle").addEventListener("click", () => {
  if (playing) selectedPose = [1, 0, 2, 0][animationStep % 4] as PoseIndex;
  playing = !playing;
  previousTime = 0;
  updateSelection();
});
document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach((button) =>
  button.addEventListener("click", () => {
    selectedPose = Number(button.dataset.pose) as PoseIndex;
    playing = false;
    updateSelection();
  }),
);
element("sheet-wrap").addEventListener("click", (event) => {
  const bounds = sheetCanvas.getBoundingClientRect();
  const row = Math.max(
    0,
    Math.min(7, Math.floor(((event.clientY - bounds.top) / bounds.height) * 8)),
  );
  const column = Math.max(
    0,
    Math.min(5, Math.floor(((event.clientX - bounds.left) / bounds.width) * 6)),
  );
  direction = DIRECTIONS[row].id;
  motion = column < 3 ? "walk" : "run";
  selectedPose = (column % 3) as PoseIndex;
  playing = false;
  updateSelection();
});
input("show-grid").addEventListener("change", () =>
  element("sheet-wrap").classList.toggle(
    "show-grid",
    input("show-grid").checked,
  ),
);
document
  .querySelectorAll<HTMLButtonElement>("[data-background]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      element("preview-stage").dataset.bg = button.dataset.background;
      document
        .querySelectorAll<HTMLButtonElement>("[data-background]")
        .forEach((value) => {
          value.classList.toggle("active", value === button);
          value.setAttribute("aria-pressed", String(value === button));
        });
    }),
  );

for (const id of pixelIds)
  element(id).addEventListener("input", () => {
    updateLabels();
    clearTimeout(pixelTimer);
    pixelTimer = setTimeout(refreshPixels, 90);
  });
for (const id of renderIds)
  element(id).addEventListener("input", () => {
    updateLabels();
    dirty =
      !sprites ||
      JSON.stringify(renderSettings()) !== JSON.stringify(renderedSettings);
    setStatus(
      dirty
        ? "ポーズ・構図を変更しました。「48コマを生成」で反映します。"
        : "48 / 48 コマ完成。PNG・ZIPを保存できます。",
      dirty ? 0 : 100,
    );
    updateButtons();
  });
element("reset-settings").addEventListener("click", () => {
  const p = DEFAULT_PIXEL_SETTINGS;
  const r = DEFAULT_RENDER_SETTINGS;
  const values: Record<string, number> = {
    colors: p.colors,
    contrast: p.contrast * 100,
    saturation: p.saturation * 100,
    "camera-elevation": r.cameraElevation,
    scale: r.scale * 100,
    "ground-offset": r.groundOffset,
    "facing-offset": r.facingOffset,
    "motion-strength": r.motionStrength * 100,
    "head-scale": r.headScale * 100,
  };
  for (const [id, value] of Object.entries(values))
    input(id).value = String(Math.round(value));
  input("outline").checked = p.outline;
  input("dither").checked = p.dither;
  updateLabels();
  dirty = true;
  updateButtons();
  void generate();
});

input("vrm-file").addEventListener("change", () => {
  const file = input("vrm-file").files?.[0];
  if (file) void loadFile(file);
  input("vrm-file").value = "";
});
const dropZone = element("drop-zone");
for (const name of ["dragenter", "dragover"])
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    if (!busy) dropZone.classList.add("dragging");
  });
for (const name of ["dragleave", "drop"])
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file && !busy) void loadFile(file);
});
// Keep dropping a model outside the upload target from navigating away.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
element("load-demo").addEventListener("click", () => void loadDemo());
generateButton.addEventListener("click", () => {
  if (busy === "rendering") abortController?.abort();
  else void generate();
});

async function exportImages(
  kind: "all" | "walk" | "run" | "zip",
): Promise<void> {
  if (!sprites || !model || busy || dirty) return;
  clearTimeout(pixelTimer);
  refreshPixels();
  clearError();
  setBusy("exporting");
  setStatus(
    kind === "zip"
      ? "48枚のPNGとシートをZIPにまとめています…"
      : "PNGを書き出しています…",
  );
  try {
    if (kind === "zip")
      await downloadBundle(
        sprites,
        baseName,
        renderedSettings,
        pixelSettings(),
        model,
      );
    else await downloadSheet(sprites, kind, baseName);
    setStatus(
      "保存を開始しました。ブラウザのダウンロード先を確認してください。",
      100,
    );
  } catch (error) {
    reportError(error);
    setStatus("書き出せませんでした。もう一度お試しください。");
  } finally {
    setBusy(null);
  }
}
element("download-sheet").addEventListener(
  "click",
  () => void exportImages("all"),
);
element("download-walk").addEventListener(
  "click",
  () => void exportImages("walk"),
);
element("download-run").addEventListener(
  "click",
  () => void exportImages("run"),
);
element("download-zip").addEventListener(
  "click",
  () => void exportImages("zip"),
);
element("help-toggle").addEventListener("click", () => {
  const panel = element("help-panel");
  panel.hidden = !panel.hidden;
  element("help-toggle").setAttribute("aria-expanded", String(!panel.hidden));
});

function tick(time: number): void {
  if (playing && sprites && !document.hidden) {
    const duration = (motion === "walk" ? 150 : 90) / number("speed");
    if (!previousTime) previousTime = time;
    const steps = Math.floor((time - previousTime) / duration);
    if (steps > 0) {
      animationStep = (animationStep + steps) % 4;
      previousTime += steps * duration;
      paintPreview();
    }
  } else previousTime = 0;
  requestAnimationFrame(tick);
}

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    abortController?.abort();
    engine?.dispose();
  }
});
updateLabels();
updateSelection();
updateButtons();
requestAnimationFrame(tick);
void loadDemo();
