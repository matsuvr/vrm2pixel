import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MToonMaterial, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { createLocomotionPose } from "./pose";
import { fittedSpan, groundProjectedBounds, measurePosedModel } from "./framing";
import type { ProjectedBounds } from "./framing";
import { DIRECTIONS, FRAME_COUNT, FRAME_SIZE, GROUND_PIXEL, MOTIONS } from "./types";
import type {
  ModelInfo,
  DirectionId,
  Motion,
  PoseIndex,
  ProgressCallback,
  RawFrame,
  RenderSettings,
} from "./types";

const RENDER_SIZE = FRAME_SIZE * 4;
const POSES: readonly PoseIndex[] = [0, 1, 2];
const REQUIRED_BONES: readonly VRMHumanBoneName[] = [
  "hips",
  "spine",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
];

interface LoadedModel {
  vrm: VRM;
  pivot: Group;
  offset: Group;
  headScale: Vector3;
  height: number;
  isVRM0: boolean;
  info: ModelInfo;
}

interface PoseBounds {
  direction: DirectionId;
  yaw: number;
  motion: Motion;
  pose: PoseIndex;
  bounds: ProjectedBounds;
  groundTranslation: number;
}

function abortError(): DOMException {
  return new DOMException("生成を中止しました。", "AbortError");
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function finiteBox(box: Box3): boolean {
  return (
    !box.isEmpty() &&
    [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
  );
}

function materialsOf(object: Mesh): Material[] {
  return Array.isArray(object.material) ? object.material : [object.material];
}

function disposeVRM(vrm: VRM): void {
  const images = new Set<ImageBitmap>();
  const collectTexture = (value: unknown): void => {
    if (
      value instanceof Texture &&
      typeof ImageBitmap !== "undefined" &&
      value.image instanceof ImageBitmap
    ) {
      images.add(value.image);
    }
  };
  vrm.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of materialsOf(object)) {
      for (const value of Object.values(material)) collectTexture(value);
      if (material instanceof MToonMaterial) {
        for (const uniform of Object.values(material.uniforms))
          collectTexture(uniform.value);
      }
    }
  });
  vrm.scene.removeFromParent();
  VRMUtils.deepDispose(vrm.scene);
  if (vrm.meta.metaVersion === "0") vrm.meta.texture?.dispose();
  images.forEach((image) => image.close());
}

function disposeModel(model: LoadedModel): void {
  model.pivot.removeFromParent();
  disposeVRM(model.vrm);
}

/** WebGL backend of the shared SpriteEngine, including the local CLI. */
export class AvatarRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private readonly readbackCanvas: HTMLCanvasElement;
  private readonly readbackContext: CanvasRenderingContext2D;
  private model: LoadedModel | null = null;
  private loadSequence = 0;
  private captureSequence = 0;
  private disposed = false;
  private contextLost = false;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.captureSequence += 1;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
  };

  constructor(canvas: HTMLCanvasElement) {
    try {
      this.renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      throw new Error(
        "WebGL 2を利用できません。ブラウザのハードウェアアクセラレーションを有効にして、再読み込みしてください。",
      );
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_SIZE, RENDER_SIZE, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.debug.onShaderError = (
      gl,
      program,
      vertexShader,
      fragmentShader,
    ): void => {
      console.error("VRM material shader error", {
        program: gl.getProgramInfoLog(program),
        vertex: gl.getShaderInfoLog(vertexShader),
        fragment: gl.getShaderInfoLog(fragmentShader),
      });
      throw new Error(
        "VRMのマテリアルを描画できませんでした。ブラウザを更新するか、別のVRMでお試しください。",
      );
    };
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    // MToon sums direct and indirect Lambert diffuse (each divided by PI).
    // Keep the total diffuse light budget below PI to preserve pale textures
    // under NoToneMapping, rather than clipping them to featureless white.
    this.scene.add(new HemisphereLight(0xffffff, 0xb1b7c3, 1.25));
    const keyLight = new DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-3, 5, 6);
    this.scene.add(keyLight);
    const fillLight = new DirectionalLight(0xe8eeff, 0.35);
    fillLight.position.set(3, 2, -4);
    this.scene.add(fillLight);

    this.readbackCanvas = document.createElement("canvas");
    this.readbackCanvas.width = RENDER_SIZE;
    this.readbackCanvas.height = RENDER_SIZE;
    const context = this.readbackCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      canvas.removeEventListener("webglcontextlost", this.onContextLost);
      canvas.removeEventListener(
        "webglcontextrestored",
        this.onContextRestored,
      );
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      throw new Error("画像書き出し用のCanvasを作成できませんでした。");
    }
    this.readbackContext = context;
  }

  get info(): ModelInfo | null {
    return this.model?.info ?? null;
  }

  async load(buffer: ArrayBuffer, filename: string): Promise<ModelInfo> {
    if (this.disposed)
      throw new Error("レンダラーは終了しています。再読み込みしてください。");
    const ticket = ++this.loadSequence;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(buffer, "");
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm?.humanoid) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error(
        "VRMのヒューマノイド情報が見つかりません。VRM 0.x または VRM 1.0 ファイルを選択してください。",
      );
    }
    let transferred = false;
    try {
      const nextModel = this.prepareModel(vrm, filename);
      if (ticket !== this.loadSequence || this.disposed) throw abortError();
      this.captureSequence += 1;
      if (this.model) disposeModel(this.model);
      this.model = nextModel;
      this.scene.add(nextModel.pivot);
      transferred = true;
      this.renderer.renderLists.dispose();
      return nextModel.info;
    } finally {
      // Parsing may succeed even when bounds, bone transforms or metadata
      // preparation subsequently fails. Keep the existing avatar and free all
      // allocations owned by an unsuccessful candidate in that case as well.
      if (!transferred) disposeVRM(vrm);
    }
  }

  private prepareModel(vrm: VRM, filename: string): LoadedModel {
    const missing = REQUIRED_BONES.filter(
      (bone) => !vrm.humanoid.getNormalizedBoneNode(bone),
    );
    if (missing.length > 0) {
      throw new Error(
        `歩行に必要なボーンが見つかりません: ${missing.join(", ")}`,
      );
    }

    VRMUtils.rotateVRM0(vrm);
    vrm.humanoid.autoUpdateHumanBones = true;
    if (vrm.lookAt) {
      vrm.lookAt.autoUpdate = false;
      vrm.lookAt.target = null;
      vrm.lookAt.reset();
    }
    vrm.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.frustumCulled = false;
      // One-pixel outlines are generated after downsampling, independently of
      // each avatar's world-space MToon outline width.
      for (const material of materialsOf(object)) {
        if (material instanceof MToonMaterial && material.isOutline)
          material.visible = false;
      }
    });

    const pivot = new Group();
    const offset = new Group();
    pivot.add(offset);
    offset.add(vrm.scene);
    pivot.updateMatrixWorld(true);
    vrm.humanoid.update();
    pivot.updateMatrixWorld(true);
    const hips = vrm.humanoid
      .getRawBoneNode("hips")!
      .getWorldPosition(new Vector3());
    offset.position.set(-hips.x, 0, -hips.z);
    pivot.updateMatrixWorld(true);
    const bounds = measurePosedModel(pivot, [], 0).world;
    const height = bounds.max.y - bounds.min.y;
    if (!finiteBox(bounds) || !Number.isFinite(height) || height <= 0) {
      throw new Error(
        "表示できる形状が見つかりません。VRMのメッシュとスキニング設定を確認してください。",
      );
    }

    const metadata = vrm.meta;
    const info: ModelInfo = {
      name:
        (metadata.metaVersion === "0" ? metadata.title : metadata.name) ||
        filename.replace(/\.vrm$/i, ""),
      author:
        (metadata.metaVersion === "0"
          ? metadata.author
          : metadata.authors.join(" / ")) || "",
      version: metadata.metaVersion === "0" ? "VRM 0.x" : "VRM 1.0",
      warnings: [],
    };
    return {
      vrm,
      pivot,
      offset,
      headScale: vrm.humanoid.getRawBoneNode("head")!.scale.clone(),
      height,
      isVRM0: metadata.metaVersion === "0",
      info,
    };
  }

  private ensureActive(
    model: LoadedModel,
    ticket: number,
    signal?: AbortSignal,
  ): void {
    if (this.contextLost)
      throw new Error(
        "WebGLの接続が失われました。少し待って再生成するか、ページを再読み込みしてください。",
      );
    if (
      signal?.aborted ||
      this.disposed ||
      this.model !== model ||
      ticket !== this.captureSequence
    )
      throw abortError();
  }

  private applyPose(
    model: LoadedModel,
    motion: Motion,
    pose: PoseIndex,
    settings: RenderSettings,
  ): void {
    const { vrm, pivot, offset } = model;
    pivot.rotation.set(0, 0, 0);
    offset.position.y = 0;
    pivot.updateMatrixWorld(true);
    vrm.springBoneManager?.reset();
    vrm.humanoid.resetNormalizedPose();
    vrm.humanoid.setNormalizedPose(
      createLocomotionPose(motion, pose, settings.motionStrength, model.isVRM0),
    );
    const head = vrm.humanoid.getRawBoneNode("head")!;
    head.scale.copy(model.headScale).multiplyScalar(settings.headScale);
    vrm.humanoid.update();
    vrm.nodeConstraintManager?.update();
    vrm.expressionManager?.update();
    // Leave springs at their rest rotations: stills must not depend on the
    // previous direction, tab visibility, or elapsed wall-clock time.
    for (const material of vrm.materials ?? []) {
      if (material instanceof MToonMaterial) material.update(0);
    }
    pivot.updateMatrixWorld(true);
  }

  private fitCamera(
    bounds: PoseBounds[],
    settings: RenderSettings,
    modelHeight: number,
  ): void {
    const elevation = (settings.cameraElevation * Math.PI) / 180;
    const span = fittedSpan(bounds.map((frame) => frame.bounds), settings.scale);
    const bottom =
      (-(FRAME_SIZE - GROUND_PIXEL - settings.groundOffset) * span) /
      FRAME_SIZE;
    this.camera.left = -span / 2;
    this.camera.right = span / 2;
    this.camera.bottom = bottom;
    this.camera.top = bottom + span;
    const distance = Math.max(span * 5, modelHeight * 5);
    this.camera.position.set(
      0,
      Math.sin(elevation) * distance,
      Math.cos(elevation) * distance,
    );
    this.camera.near = Math.max(distance / 10000, 0.0001);
    this.camera.far = distance + Math.max(span, modelHeight) * 10;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  async capture(
    settings: RenderSettings,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<RawFrame[]> {
    const model = this.model;
    if (!model) throw new Error("先にVRMファイルを読み込んでください。");
    if (
      !Object.values(settings).every(Number.isFinite) ||
      settings.scale <= 0 ||
      settings.headScale <= 0 ||
      settings.motionStrength < 0
    ) {
      throw new Error("描画設定の数値を確認してください。");
    }
    const ticket = ++this.captureSequence;
    this.ensureActive(model, ticket, signal);
    onProgress?.(0, FRAME_COUNT);
    const allBounds: PoseBounds[] = [];
    const elevation = (settings.cameraElevation * Math.PI) / 180;
    const yaws = DIRECTIONS.map(
      (direction) => ((direction.yaw + settings.facingOffset) * Math.PI) / 180,
    );
    for (const motion of MOTIONS) {
      for (const pose of POSES) {
        this.ensureActive(model, ticket, signal);
        this.applyPose(model, motion, pose, settings);
        const measured = measurePosedModel(model.pivot, yaws, elevation);
        if (!finiteBox(measured.world))
          throw new Error(
            "ポーズの範囲を計算できませんでした。モデルのボーン設定を確認してください。",
          );
        const lift =
          motion === "run" && pose === 0
            ? model.height * 0.018 * settings.motionStrength
            : 0;
        for (let view = 0; view < DIRECTIONS.length; view++) {
          const bounds = measured.views[view]!;
          // Ground in screen space: projected toe depth must not consume the
          // tiny area below the anchor and shrink the entire character.
          allBounds.push({
            direction: DIRECTIONS[view]!.id,
            yaw: yaws[view]!,
            motion,
            pose,
            ...groundProjectedBounds(bounds, elevation, lift),
          });
        }
        await yieldToBrowser();
      }
    }
    this.fitCamera(allBounds, settings, model.height);
    const frames: RawFrame[] = [];
    for (const direction of DIRECTIONS) {
      for (const poseBounds of allBounds.filter(
        (frame) => frame.direction === direction.id,
      )) {
        this.ensureActive(model, ticket, signal);
        this.applyPose(model, poseBounds.motion, poseBounds.pose, settings);
        model.offset.position.y = poseBounds.groundTranslation;
        model.pivot.rotation.y = poseBounds.yaw;
        this.scene.updateMatrixWorld(true);
        this.renderer.render(this.scene, this.camera);
        this.readbackContext.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
        this.readbackContext.drawImage(this.renderer.domElement, 0, 0);
        frames.push({
          direction: direction.id,
          motion: poseBounds.motion,
          pose: poseBounds.pose,
          pixels: this.readbackContext.getImageData(
            0,
            0,
            RENDER_SIZE,
            RENDER_SIZE,
          ),
        });
        onProgress?.(frames.length, FRAME_COUNT);
        if (frames.length % 3 === 0) await yieldToBrowser();
      }
    }
    this.ensureActive(model, ticket, signal);
    return frames;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadSequence += 1;
    this.captureSequence += 1;
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.readbackCanvas.width = 0;
    this.readbackCanvas.height = 0;
  }
}
