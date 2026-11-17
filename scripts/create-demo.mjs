/**
 * Create the original, redistributable Mint demonstration avatar.
 * No external model, texture, geometry, or runtime dependency is used.
 * Run: node scripts/create-demo.mjs
 * The generated artwork and this generator are dedicated to CC0 1.0.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const boneDefinitions = [
  ["hips", null, [0, 0.94, 0]],
  ["spine", "hips", [0, 0.17, 0]],
  ["chest", "spine", [0, 0.24, 0]],
  ["upperChest", "chest", [0, 0.13, 0]],
  ["neck", "upperChest", [0, 0.11, 0]],
  ["head", "neck", [0, 0.08, 0]],
  ["leftShoulder", "upperChest", [0.14, 0, 0]],
  ["leftUpperArm", "leftShoulder", [0.15, 0, 0]],
  ["leftLowerArm", "leftUpperArm", [0.34, 0, 0]],
  ["leftHand", "leftLowerArm", [0.29, 0, 0]],
  ["rightShoulder", "upperChest", [-0.14, 0, 0]],
  ["rightUpperArm", "rightShoulder", [-0.15, 0, 0]],
  ["rightLowerArm", "rightUpperArm", [-0.34, 0, 0]],
  ["rightHand", "rightLowerArm", [-0.29, 0, 0]],
  ["leftUpperLeg", "hips", [0.17, -0.06, 0]],
  ["leftLowerLeg", "leftUpperLeg", [0, -0.39, 0]],
  ["leftFoot", "leftLowerLeg", [0, -0.36, 0.015]],
  ["leftToes", "leftFoot", [0, -0.055, 0.2]],
  ["rightUpperLeg", "hips", [-0.17, -0.06, 0]],
  ["rightLowerLeg", "rightUpperLeg", [0, -0.39, 0]],
  ["rightFoot", "rightLowerLeg", [0, -0.36, 0.015]],
  ["rightToes", "rightFoot", [0, -0.055, 0.2]],
];

const materials = [
  ["skin", "#ffceaa"],
  ["hair", "#28bbaa"],
  ["hairLight", "#79e5d2"],
  ["hairDark", "#147f7d"],
  ["coat", "#293c59"],
  ["coatLight", "#3d5775"],
  ["pants", "#3b465e"],
  ["boots", "#182438"],
  ["gold", "#ffd37a"],
  ["eyes", "#12273e"],
  ["white", "#fff5e1"],
  ["scarf", "#57d8c2"],
  ["cheeks", "#ef9293"],
];

function sRGBtoLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function color(hex) {
  return [1, 3, 5].map((offset) =>
    sRGBtoLinear(parseInt(hex.slice(offset, offset + 2), 16)),
  );
}

function buildAvatar(version) {
  // VRM0 faces -Z and VRM1 faces +Z. Rotate the actual rest geometry AND
  // skeleton for the VRM0 fixture, rather than just changing its metadata.
  const facing = version === "0" ? -1 : 1;
  const transform = ([x, y, z]) => [x * facing, y, z * facing];
  const nodes = [{ name: "MintAvatar", children: [] }];
  const jointIndex = new Map();
  const nodeIndex = new Map();
  const boneWorld = new Map();
  boneDefinitions.forEach(([name, parent, translation], joint) => {
    const index = nodes.length;
    const local = transform(translation);
    const parentWorld = parent ? boneWorld.get(parent) : [0, 0, 0];
    boneWorld.set(
      name,
      local.map((component, axis) => component + parentWorld[axis]),
    );
    nodeIndex.set(name, index);
    jointIndex.set(name, joint);
    nodes.push({ name, translation: local, children: [] });
    nodes[parent ? nodeIndex.get(parent) : 0].children.push(index);
  });
  const groups = new Map(
    materials.map(([name]) => [
      name,
      { position: [], normal: [], joints: [], weights: [], indices: [] },
    ]),
  );

  function vertices(material, bone, positions, normals, indices) {
    const group = groups.get(material);
    const first = group.position.length / 3;
    const joint = jointIndex.get(bone);
    positions.forEach((p, i) => {
      group.position.push(...transform(p));
      group.normal.push(...transform(normals[i]));
      group.joints.push(joint, 0, 0, 0);
      group.weights.push(1, 0, 0, 0);
    });
    group.indices.push(...indices.map((i) => i + first));
  }

  function box(material, bone, center, size) {
    const faces = [
      [
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ],
      [
        [-1, 0, 0],
        [0, 0, 1],
        [0, 1, 0],
      ],
      [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, -1],
      ],
      [
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 1],
      ],
      [
        [0, 0, 1],
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [0, 0, -1],
        [-1, 0, 0],
        [0, 1, 0],
      ],
    ];
    const p = [],
      n = [],
      idx = [];
    for (const [normal, u, v] of faces) {
      const start = p.length;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        p.push(
          center.map(
            (c, axis) =>
              c +
              ((normal[axis] + su * u[axis] + sv * v[axis]) * size[axis]) / 2,
          ),
        );
        n.push(normal);
      }
      idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    vertices(material, bone, p, n, idx);
  }

  function oval(material, bone, center, radius, segments = 12, rings = 8) {
    const p = [],
      n = [],
      idx = [];
    for (let row = 0; row <= rings; row++) {
      const theta = (Math.PI * row) / rings;
      for (let column = 0; column <= segments; column++) {
        const phi = (Math.PI * 2 * column) / segments;
        const unit = [
          Math.sin(theta) * Math.cos(phi),
          Math.cos(theta),
          Math.sin(theta) * Math.sin(phi),
        ];
        p.push(unit.map((c, axis) => center[axis] + c * radius[axis]));
        const normal = unit.map((c, axis) => c / radius[axis]);
        const length = Math.hypot(...normal);
        n.push(normal.map((c) => c / length));
      }
    }
    for (let row = 0; row < rings; row++) {
      for (let column = 0; column < segments; column++) {
        const a = row * (segments + 1) + column;
        const b = a + segments + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    vertices(material, bone, p, n, idx);
  }

  // Broad, overlapping limb sections remain readable at a 32px target size.
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    oval(
      "pants",
      `${side}UpperLeg`,
      [sign * 0.17, 0.705, 0],
      [0.135, 0.25, 0.14],
    );
    oval(
      "pants",
      `${side}LowerLeg`,
      [sign * 0.17, 0.32, 0.01],
      [0.12, 0.22, 0.12],
    );
    box(
      "boots",
      `${side}Foot`,
      [sign * 0.17, 0.095, 0.095],
      [0.27, 0.17, 0.41],
    );
    box("gold", `${side}Foot`, [sign * 0.17, 0.17, 0.11], [0.23, 0.045, 0.3]);
    oval(
      "coat",
      `${side}UpperArm`,
      [sign * 0.46, 1.48, 0],
      [0.23, 0.145, 0.15],
    );
    oval(
      "coatLight",
      `${side}LowerArm`,
      [sign * 0.76, 1.48, 0],
      [0.19, 0.115, 0.12],
    );
    box("gold", `${side}LowerArm`, [sign * 0.85, 1.48, 0], [0.055, 0.21, 0.22]);
    oval("skin", `${side}Hand`, [sign * 0.97, 1.48, 0.01], [0.12, 0.12, 0.12]);
  }

  oval("coat", "hips", [0, 0.98, 0], [0.31, 0.18, 0.19]);
  oval("coat", "spine", [0, 1.15, 0], [0.29, 0.23, 0.18]);
  oval("coatLight", "chest", [0, 1.365, 0], [0.32, 0.21, 0.19]);
  box("gold", "hips", [0, 1.02, 0.015], [0.59, 0.08, 0.38]);
  box("boots", "hips", [0, 1.02, 0.216], [0.12, 0.12, 0.035]);
  box("gold", "spine", [0, 1.16, 0.176], [0.055, 0.19, 0.045]);
  oval("skin", "neck", [0, 1.59, 0], [0.12, 0.12, 0.11]);
  oval("scarf", "upperChest", [0, 1.53, 0.02], [0.255, 0.105, 0.21]);
  box("scarf", "chest", [-0.11, 1.38, 0.195], [0.13, 0.23, 0.045]);
  box("hairDark", "chest", [-0.11, 1.28, 0.2], [0.13, 0.045, 0.05]);

  // Head: a simple original bob haircut and a face that stays legible from
  // front/side/back. The single gold clip deliberately breaks symmetry.
  oval("hairDark", "head", [0, 1.955, -0.095], [0.405, 0.405, 0.325]);
  oval("skin", "head", [0, 1.89, 0.055], [0.335, 0.335, 0.29]);
  oval("hair", "head", [0, 2.135, -0.025], [0.405, 0.24, 0.335]);
  oval("hair", "head", [-0.34, 1.91, 0.015], [0.11, 0.28, 0.23]);
  oval("hairLight", "head", [0.335, 1.93, 0.015], [0.12, 0.27, 0.21]);
  oval("hair", "head", [-0.14, 2.12, 0.245], [0.25, 0.14, 0.11]);
  oval("hairLight", "head", [0.16, 2.16, 0.24], [0.17, 0.13, 0.115]);
  oval("hair", "head", [-0.12, 2.32, -0.015], [0.13, 0.14, 0.13]);
  box("gold", "head", [0.333, 2.05, 0.19], [0.09, 0.14, 0.09]);
  for (const sign of [-1, 1]) {
    box("white", "head", [sign * 0.132, 1.925, 0.323], [0.11, 0.13, 0.028]);
    box("eyes", "head", [sign * 0.132, 1.92, 0.342], [0.07, 0.105, 0.025]);
    box(
      "white",
      "head",
      [sign * 0.132 - 0.012, 1.945, 0.357],
      [0.023, 0.031, 0.008],
    );
    oval(
      "cheeks",
      "head",
      [sign * 0.226, 1.835, 0.275],
      [0.055, 0.035, 0.022],
      8,
      4,
    );
  }
  box("skin", "head", [0, 1.84, 0.346], [0.05, 0.055, 0.06]);
  box("eyes", "head", [0, 1.755, 0.305], [0.07, 0.024, 0.015]);

  const buffers = [],
    bufferViews = [],
    accessors = [];
  let byteLength = 0;
  function attribute(values, type, componentType, target) {
    const TypedArray = componentType === 5126 ? Float32Array : Uint16Array;
    const array = new TypedArray(values);
    const data = Buffer.from(array.buffer);
    const aligned = (byteLength + 3) & ~3;
    if (aligned !== byteLength)
      buffers.push(Buffer.alloc(aligned - byteLength));
    byteLength = aligned;
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: data.length,
      ...(target ? { target } : {}),
    });
    buffers.push(data);
    byteLength += data.length;
    const components = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const accessor = {
      bufferView: viewIndex,
      byteOffset: 0,
      componentType,
      count: values.length / components,
      type,
    };
    if (type === "VEC3") {
      accessor.min = [0, 1, 2].map((axis) =>
        Math.min(...values.filter((_, i) => i % 3 === axis)),
      );
      accessor.max = [0, 1, 2].map((axis) =>
        Math.max(...values.filter((_, i) => i % 3 === axis)),
      );
    }
    const result = accessors.length;
    accessors.push(accessor);
    return result;
  }
  const primitives = [];
  materials.forEach(([name], index) => {
    const group = groups.get(name);
    if (!group.position.length) return;
    primitives.push({
      attributes: {
        POSITION: attribute(group.position, "VEC3", 5126, 34962),
        NORMAL: attribute(group.normal, "VEC3", 5126, 34962),
        JOINTS_0: attribute(group.joints, "VEC4", 5123, 34962),
        WEIGHTS_0: attribute(group.weights, "VEC4", 5126, 34962),
      },
      indices: attribute(group.indices, "SCALAR", 5123, 34963),
      material: index,
      mode: 4,
    });
  });
  const inverseBinds = [];
  for (const [name] of boneDefinitions) {
    const [x, y, z] = boneWorld.get(name);
    inverseBinds.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1);
  }
  const inverseBindMatrices = attribute(inverseBinds, "MAT4", 5126);
  const modelNode = nodes.length;
  nodes.push({ name: "MintSkinnedMesh", mesh: 0, skin: 0 });
  nodes[0].children.push(modelNode);
  for (const node of nodes)
    if (node.children?.length === 0) delete node.children;
  const humanBones = Object.fromEntries(
    boneDefinitions.map(([name]) => [name, { node: nodeIndex.get(name) }]),
  );
  const vrm1 = {
    specVersion: "1.0",
    meta: {
      name: "ミント / Mint",
      version: "1.0",
      authors: ["VRM Pixel Studio demo"],
      copyrightInformation:
        "Original procedural demo avatar. Dedicated to CC0 1.0.",
      licenseUrl: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      allowExcessivelyViolentUsage: true,
      allowExcessivelySexualUsage: true,
      commercialUsage: "corporation",
      allowPoliticalOrReligiousUsage: true,
      allowAntisocialOrHateUsage: true,
      creditNotation: "unnecessary",
      allowRedistribution: true,
      modification: "allowModificationRedistribution",
      otherLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    humanoid: { humanBones },
    firstPerson: { meshAnnotations: [{ node: modelNode, type: "both" }] },
  };
  const vrm0 = {
    exporterVersion: "VRM Pixel Studio original fixture 1.0",
    specVersion: "0.0",
    meta: {
      title: "ミント / Mint (VRM0 test)",
      version: "1.0",
      author: "VRM Pixel Studio demo",
      allowedUserName: "Everyone",
      violentUssageName: "Allow",
      sexualUssageName: "Allow",
      commercialUssageName: "Allow",
      licenseName: "CC0",
      otherLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    humanoid: {
      humanBones: boneDefinitions.map(([name]) => ({
        bone: name,
        node: nodeIndex.get(name),
        useDefaultValues: true,
      })),
    },
    firstPerson: {
      firstPersonBone: nodeIndex.get("head"),
      firstPersonBoneOffset: { x: 0, y: 0.1, z: 0 },
      meshAnnotations: [{ mesh: 0, firstPersonFlag: "Both" }],
      lookAtTypeName: "Bone",
      lookAtHorizontalInner: {
        curve: [0, 0, 0, 1, 1, 1, 1, 0],
        xRange: 90,
        yRange: 10,
      },
      lookAtHorizontalOuter: {
        curve: [0, 0, 0, 1, 1, 1, 1, 0],
        xRange: 90,
        yRange: 10,
      },
      lookAtVerticalDown: {
        curve: [0, 0, 0, 1, 1, 1, 1, 0],
        xRange: 90,
        yRange: 10,
      },
      lookAtVerticalUp: {
        curve: [0, 0, 0, 1, 1, 1, 1, 0],
        xRange: 90,
        yRange: 10,
      },
    },
    blendShapeMaster: { blendShapeGroups: [] },
    secondaryAnimation: { boneGroups: [], colliderGroups: [] },
    materialProperties: materials.map(([name]) => ({
      name,
      shader: "VRM_USE_GLTFSHADER",
      renderQueue: -1,
      floatProperties: {},
      vectorProperties: {},
      textureProperties: {},
      keywordMap: {},
      tagMap: {},
    })),
  };
  const extension = version === "0" ? "VRM" : "VRMC_vrm";
  const gltf = {
    asset: {
      version: "2.0",
      generator: "VRM Pixel Studio original procedural avatar generator",
    },
    scene: 0,
    scenes: [{ name: "Mint", nodes: [0] }],
    nodes,
    meshes: [{ name: "Mint", primitives }],
    materials: materials.map(([name, hex]) => ({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...color(hex), 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: false,
    })),
    skins: [
      {
        name: "MintHumanoid",
        joints: boneDefinitions.map(([name]) => nodeIndex.get(name)),
        skeleton: nodeIndex.get("hips"),
        inverseBindMatrices,
      },
    ],
    buffers: [{ byteLength }],
    bufferViews,
    accessors,
    extensionsUsed: [extension],
    extensions: { [extension]: version === "0" ? vrm0 : vrm1 },
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const binary = Buffer.concat([
    ...buffers,
    Buffer.alloc((4 - (byteLength % 4)) % 4),
  ]);
  const header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binHeader, binary]);
}

for (const [version, path] of [
  ["1", "public/demo.vrm"],
  ["0", "tests/fixtures/demo-vrm0.vrm"],
]) {
  const destination = resolve(projectRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  const bytes = buildAvatar(version);
  await writeFile(destination, bytes);
  console.log(
    `Created ${path}: ${bytes.length.toLocaleString()} bytes (VRM ${version}).`,
  );
}
