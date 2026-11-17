import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";
import {
  fittedSpan,
  groundProjectedBounds,
  measurePosedModel,
} from "../src/framing";
import { createLocomotionPose } from "../src/pose";
import { DIRECTIONS, FRAME_SIZE, GROUND_PIXEL } from "../src/types";

test("framing uses drawn vertices and material groups, excluding hidden and unused geometry", () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([
      -1, 0, 1, 1, 0, -1, 0, 2, 0,
      -100, -100, -100, 100, 100, 100, 100, -100, 100,
      1000, 1000, 1000,
    ], 3),
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5, 6]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  geometry.setDrawRange(0, 6);
  const visible = new MeshBasicMaterial();
  const hidden = new MeshBasicMaterial({ visible: false });
  const root = new Group();
  root.add(new Mesh(geometry, [visible, hidden]));
  const hiddenMesh = new Mesh(geometry, visible);
  hiddenMesh.position.y = 10000;
  hiddenMesh.visible = false;
  root.add(hiddenMesh);
  try {
    const measured = measurePosedModel(root, [0, Math.PI / 4], 0);
    assert.deepEqual(measured.world.min.toArray(), [-1, 0, -1]);
    assert.deepEqual(measured.world.max.toArray(), [1, 2, 1]);
    assert.ok(Math.abs(measured.views[1]!.minX) < 1e-10);
    assert.ok(Math.abs(measured.views[1]!.maxX) < 1e-10);
    // Both vertices at x/z extremes project to x=0; an AABB would invent width.
    assert.equal(measured.views[0]!.maxY, 2);
  } finally {
    geometry.dispose();
    visible.dispose();
    hidden.dispose();
  }
});

test("projected toe depth is grounded before fitting, allowing a full-height sprite", () => {
  const elevation = 8 * Math.PI / 180;
  const view = { minX: -0.3, maxX: 0.3, minY: -0.15, maxY: 1.5 };
  const grounded = groundProjectedBounds(view, elevation, 0);
  const span = fittedSpan([grounded.bounds], 1);
  assert.ok(
    Math.abs(view.minY + grounded.groundTranslation * Math.cos(elevation)) < 1e-12,
  );
  assert.equal(grounded.bounds.minY, 0);
  assert.ok(
    Math.abs(grounded.bounds.maxY * FRAME_SIZE / span - (GROUND_PIXEL - 2)) < 1e-10,
  );
  assert.ok(span < 2, "The 2px bottom margin must not force the old 4.8-unit span");
  const airborne = groundProjectedBounds(view, elevation, 0.03);
  assert.ok(
    airborne.bounds.minY > 0,
    "The neutral run pose retains its intentional lift",
  );
  assert.ok(Math.abs(airborne.bounds.maxY - airborne.bounds.minY - 1.65) < 1e-12);
});

test("one scale accommodates hand and foot width across every frame without changing the anchor", () => {
  const views = [
    { minX: -0.3, maxX: 0.3, minY: 0, maxY: 1.7 },
    { minX: -1.4, maxX: 1.6, minY: 0, maxY: 1.5 },
  ];
  const span = fittedSpan(views, 1);
  let closestEdge = Infinity;
  for (const view of views) {
    const left = FRAME_SIZE / 2 + view.minX * FRAME_SIZE / span;
    const right = FRAME_SIZE / 2 + view.maxX * FRAME_SIZE / span;
    const top = GROUND_PIXEL - view.maxY * FRAME_SIZE / span;
    const bottom = GROUND_PIXEL - view.minY * FRAME_SIZE / span;
    assert.ok(left >= 2 && right <= FRAME_SIZE - 2);
    assert.ok(top >= 2);
    assert.equal(bottom, GROUND_PIXEL);
    closestEdge = Math.min(closestEdge, left, FRAME_SIZE - right, top);
  }
  assert.ok(
    Math.abs(closestEdge - 2) < 1e-10,
    "Use all available width or height",
  );
  assert.ok(Math.abs(fittedSpan(views, 1.25) - span / 1.25) < 1e-10);
});

test("posed VRM0 and VRM1 measurements agree and lowered hands release the T-pose width", async () => {
  const results = [];
  for (const path of ["../public/demo.vrm", "./fixtures/demo-vrm0.vrm"]) {
    const data = await readFile(new URL(path, import.meta.url));
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      "",
    );
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.rotateVRM0(vrm);
    vrm.update(0);
    const yaws = DIRECTIONS.map((direction) => direction.yaw * Math.PI / 180);
    const rest = measurePosedModel(vrm.scene, yaws, 8 * Math.PI / 180);
    vrm.humanoid.setNormalizedPose(
      createLocomotionPose("walk", 0, 1, vrm.meta.metaVersion === "0"),
    );
    vrm.update(0);
    try {
      const posed = measurePosedModel(vrm.scene, yaws, 8 * Math.PI / 180);
      const restWidth = rest.views[0]!.maxX - rest.views[0]!.minX;
      const posedWidth = posed.views[0]!.maxX - posed.views[0]!.minX;
      assert.ok(
        posedWidth < restWidth * 0.7,
        `${path}: rest=${restWidth}, posed=${posedWidth}`,
      );
      results.push(posed.views);
    } finally {
      VRMUtils.deepDispose(vrm.scene);
    }
  }
  for (let i = 0; i < DIRECTIONS.length; i++) {
    for (const key of ["minX", "maxX", "minY", "maxY"] as const) {
      assert.ok(
        Math.abs(results[0]![i]![key] - results[1]![i]![key]) < 1e-5,
        `${i}/${key}: VRM1=${results[0]![i]![key]}, VRM0=${results[1]![i]![key]}`,
      );
    }
  }
});
