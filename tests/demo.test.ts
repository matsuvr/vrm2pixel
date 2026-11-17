import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Box3, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

async function loadFixture(path: string): Promise<VRM> {
  const bytes = await readFile(new URL(path, import.meta.url));
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const vrm = gltf.userData.vrm as VRM | undefined;
  assert.ok(vrm instanceof VRM, "The fixture must parse as an actual VRM");
  VRMUtils.rotateVRM0(vrm);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}

function meshes(vrm: VRM): SkinnedMesh[] {
  const result: SkinnedMesh[] = [];
  vrm.scene.traverse((node) => {
    if (node instanceof SkinnedMesh) result.push(node);
  });
  return result;
}

test("original VRM0 and VRM1 fixtures load with a real skeleton and the same front direction", async () => {
  const models = await Promise.all([
    loadFixture("../public/demo.vrm"),
    loadFixture("./fixtures/demo-vrm0.vrm"),
  ]);
  try {
    assert.equal(models[0]!.meta.metaVersion, "1");
    assert.equal(models[1]!.meta.metaVersion, "0");
    const sizes = models.map((vrm) => {
      assert.equal(Object.keys(vrm.humanoid.humanBones).length, 22);
      const skinMeshes = meshes(vrm);
      assert.ok(skinMeshes.length > 0);
      for (const mesh of skinMeshes) {
        assert.equal(
          mesh.geometry.getAttribute("skinIndex").count,
          mesh.geometry.getAttribute("position").count,
        );
        assert.equal(
          mesh.geometry.getAttribute("skinWeight").count,
          mesh.geometry.getAttribute("position").count,
        );
      }
      const face = skinMeshes.find(
        (mesh) =>
          !Array.isArray(mesh.material) && mesh.material.name === "eyes",
      );
      assert.ok(face, "Face geometry is needed to distinguish front/back");
      const facePoint = face.localToWorld(
        face.getVertexPosition(0, new Vector3()),
      );
      assert.ok(
        facePoint.z > 0.25,
        "Both versions must face +Z after VRM0 normalization",
      );
      return new Box3().setFromObject(vrm.scene).getSize(new Vector3());
    });
    assert.ok(sizes[0]!.distanceTo(sizes[1]!) < 0.00001);
  } finally {
    models.forEach((vrm) => VRMUtils.deepDispose(vrm.scene));
  }
});

test("normalized leg rotations deform the meshes and agree across VRM0/VRM1 with the version correction", async () => {
  const models = await Promise.all([
    loadFixture("../public/demo.vrm"),
    loadFixture("./fixtures/demo-vrm0.vrm"),
  ]);
  const footPositions: Vector3[] = [];
  try {
    for (const vrm of models) {
      const pants = meshes(vrm).find(
        (mesh) =>
          !Array.isArray(mesh.material) && mesh.material.name === "pants",
      );
      assert.ok(pants);
      const restPoint = pants.localToWorld(
        pants.getVertexPosition(0, new Vector3()),
      );
      const axis = vrm.meta.metaVersion === "0" ? -1 : 1;
      vrm.humanoid.getNormalizedBoneNode("rightUpperLeg")!.rotation.x =
        -0.5 * axis;
      vrm.humanoid.getNormalizedBoneNode("leftUpperLeg")!.rotation.x =
        0.5 * axis;
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      const movedPoint = pants.localToWorld(
        pants.getVertexPosition(0, new Vector3()),
      );
      assert.ok(
        restPoint.distanceTo(movedPoint) > 0.01,
        "A changed pose must change actual skinned vertices",
      );
      const right = vrm.humanoid
        .getRawBoneNode("rightFoot")!
        .getWorldPosition(new Vector3());
      const left = vrm.humanoid
        .getRawBoneNode("leftFoot")!
        .getWorldPosition(new Vector3());
      assert.ok(
        right.z > left.z + 0.4,
        "The anatomical right foot must be the forward foot",
      );
      footPositions.push(right);
    }
    assert.ok(footPositions[0]!.distanceTo(footPositions[1]!) < 0.00001);
  } finally {
    models.forEach((vrm) => VRMUtils.deepDispose(vrm.scene));
  }
});
