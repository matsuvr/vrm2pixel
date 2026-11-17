import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Box3, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createLocomotionPose } from "../src/pose";
import type { Motion, PoseIndex } from "../src/types";

const BONES = [
  "head",
  "hips",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
  "leftLowerLeg",
  "rightLowerLeg",
] as const;
type Positions = Record<(typeof BONES)[number], Vector3>;

async function fixture(path: string): Promise<VRM> {
  const data = await readFile(new URL(path, import.meta.url));
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    "",
  );
  const vrm = gltf.userData.vrm as VRM | undefined;
  assert.ok(vrm instanceof VRM);
  VRMUtils.rotateVRM0(vrm);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}

function apply(
  vrm: VRM,
  motion: Motion,
  pose: PoseIndex,
  headScale = 1,
): Positions {
  vrm.humanoid.resetNormalizedPose();
  vrm.humanoid.setNormalizedPose(
    createLocomotionPose(motion, pose, 1, vrm.meta.metaVersion === "0"),
  );
  // Fixture head rest scales are 1; production renderer preserves the avatar's
  // original scale separately before multiplying by the requested factor.
  vrm.humanoid.getRawBoneNode("head")!.scale.setScalar(headScale);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return Object.fromEntries(
    BONES.map((bone) => [
      bone,
      vrm.humanoid.getRawBoneNode(bone)!.getWorldPosition(new Vector3()),
    ]),
  ) as Positions;
}

function skinnedBounds(vrm: VRM): Box3 {
  const bounds = new Box3();
  vrm.scene.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    node.skeleton.update();
    const count = node.geometry.getAttribute("position").count;
    for (let index = 0; index < count; index += 1) {
      const point = node.localToWorld(
        node.getVertexPosition(index, new Vector3()),
      );
      assert.ok(
        point.toArray().every(Number.isFinite),
        "Skinned positions must remain finite",
      );
      bounds.expandByPoint(point);
    }
  });
  assert.ok(!bounds.isEmpty());
  return bounds;
}

test("all six generated poses preserve anatomical step labels and opposite arm swing in VRM0 and VRM1", async () => {
  const models = await Promise.all([
    fixture("../public/demo.vrm"),
    fixture("./fixtures/demo-vrm0.vrm"),
  ]);
  try {
    for (const motion of ["walk", "run"] as const) {
      for (const pose of [0, 1, 2] as const) {
        const both = models.map((vrm) => apply(vrm, motion, pose));
        for (const positions of both) {
          for (const bone of BONES)
            assert.ok(
              positions[bone].toArray().every(Number.isFinite),
              `${motion}/${pose}/${bone}`,
            );
          const legDifference = positions.rightFoot.z - positions.leftFoot.z;
          const armDifference = positions.leftHand.z - positions.rightHand.z;
          if (pose === 0) {
            assert.ok(
              Math.abs(legDifference) < 1e-5,
              "Neutral feet must have equal forward position",
            );
            assert.ok(
              Math.abs(armDifference) < 1e-5,
              "Neutral hands must be symmetric",
            );
          } else {
            const anatomicalSign = pose === 1 ? 1 : -1;
            assert.ok(
              legDifference * anatomicalSign > 0.5,
              `${motion}/${pose}: correct anatomical foot must lead`,
            );
            assert.ok(
              armDifference * anatomicalSign > 0.35,
              `${motion}/${pose}: opposite arm must lead`,
            );
          }
          assert.ok(
            positions.leftHand.y < positions.head.y &&
              positions.rightHand.y < positions.head.y,
            "Arms must be lowered from the import T-pose",
          );
        }
        for (const bone of BONES) {
          assert.ok(
            both[0]![bone].distanceTo(both[1]![bone]) < 1e-5,
            `${motion}/${pose}/${bone}: VRM0 and VRM1 must agree`,
          );
        }
      }
    }
  } finally {
    models.forEach((vrm) => VRMUtils.deepDispose(vrm.scene));
  }
});

test("running has a longer stride and raised rear foot instead of merely replaying the walk faster", async () => {
  const vrm = await fixture("../public/demo.vrm");
  try {
    for (const pose of [1, 2] as const) {
      const walk = apply(vrm, "walk", pose);
      const run = apply(vrm, "run", pose);
      assert.ok(
        Math.abs(run.rightFoot.z - run.leftFoot.z) >
          Math.abs(walk.rightFoot.z - walk.leftFoot.z) + 0.2,
      );
      const rearFoot = pose === 1 ? "leftFoot" : "rightFoot";
      const leadingFoot = pose === 1 ? "rightFoot" : "leftFoot";
      assert.ok(
        run[rearFoot].y - run[leadingFoot].y > 0.35,
        "Running rear knee must flex enough to lift its foot",
      );
      assert.ok(run[rearFoot].y > walk[rearFoot].y + 0.35);
    }
  } finally {
    VRMUtils.deepDispose(vrm.scene);
  }
});

test("head scaling changes actual skinned geometry while leaving hips and feet fixed in every pose", async () => {
  const models = await Promise.all([
    fixture("../public/demo.vrm"),
    fixture("./fixtures/demo-vrm0.vrm"),
  ]);
  try {
    for (const motion of ["walk", "run"] as const) {
      for (const pose of [0, 1, 2] as const) {
        const scaledBounds: Box3[] = [];
        for (const vrm of models) {
          const original = apply(vrm, motion, pose, 1);
          const originalBounds = skinnedBounds(vrm);
          const scaled = apply(vrm, motion, pose, 1.25);
          const enlargedBounds = skinnedBounds(vrm);
          assert.ok(
            enlargedBounds.max.y > originalBounds.max.y + 0.1,
            "Scaling must affect rendered head vertices",
          );
          for (const bone of ["hips", "leftFoot", "rightFoot"] as const) {
            assert.ok(
              original[bone].distanceTo(scaled[bone]) < 1e-5,
              "Head size must not change gait or root placement",
            );
          }
          scaledBounds.push(enlargedBounds);
        }
        assert.ok(scaledBounds[0]!.min.distanceTo(scaledBounds[1]!.min) < 1e-5);
        assert.ok(scaledBounds[0]!.max.distanceTo(scaledBounds[1]!.max) < 1e-5);
      }
    }
  } finally {
    models.forEach((vrm) => VRMUtils.deepDispose(vrm.scene));
  }
});
