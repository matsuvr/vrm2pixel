import { Box3, Mesh, Object3D, SkinnedMesh, Vector3 } from "three";
import { FRAME_SIZE, GROUND_PIXEL } from "./types";

export interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function groundProjectedBounds(
  bounds: ProjectedBounds,
  elevation: number,
  lift: number,
): { bounds: ProjectedBounds; groundTranslation: number } {
  const cosElevation = Math.cos(elevation);
  const projectedLift = lift * cosElevation;
  return {
    groundTranslation: -bounds.minY / cosElevation + lift,
    bounds: {
      ...bounds,
      minY: projectedLift,
      maxY: bounds.maxY - bounds.minY + projectedLift,
    },
  };
}

/** Measure the drawn, posed vertices, rather than rotating a loose mesh AABB. */
export function measurePosedModel(
  root: Object3D,
  yaws: readonly number[],
  elevation: number,
): { world: Box3; views: ProjectedBounds[] } {
  root.updateWorldMatrix(true, false);
  // SkinnedMesh updates its inverse bind matrix in updateMatrixWorld.
  root.updateMatrixWorld(true);
  const world = new Box3();
  const views = yaws.map(() => ({
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }));
  const rotations = yaws.map((yaw) => [Math.cos(yaw), Math.sin(yaw)] as const);
  const cosElevation = Math.cos(elevation);
  const sinElevation = Math.sin(elevation);
  const point = new Vector3();
  root.traverseVisible((object) => {
    if (!(object instanceof Mesh)) return;
    const { geometry } = object;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    if (object instanceof SkinnedMesh) object.skeleton.update();
    const index = geometry.getIndex();
    const count = index?.count ?? positions.count;
    const visited = new Uint8Array(positions.count);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const groups = Array.isArray(object.material)
      ? geometry.groups
      : [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (!material?.visible || (material.transparent && material.opacity === 0))
        continue;
      const start = Math.max(group.start, geometry.drawRange.start);
      const end = Math.min(
        count,
        group.start + group.count,
        geometry.drawRange.start + geometry.drawRange.count,
      );
      for (let i = start; i < end; i++) {
        const vertex = index ? index.getX(i) : i;
        if (visited[vertex]) continue;
        visited[vertex] = 1;
        object.getVertexPosition(vertex, point).applyMatrix4(object.matrixWorld);
        world.expandByPoint(point);
        for (let view = 0; view < views.length; view++) {
          const [c, s] = rotations[view]!;
          const x = c * point.x + s * point.z;
          const y =
            cosElevation * point.y - sinElevation * (-s * point.x + c * point.z);
          const bounds = views[view]!;
          bounds.minX = Math.min(bounds.minX, x);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxY = Math.max(bounds.maxY, y);
        }
      }
    }
  });
  return { world, views };
}

/** One scale for all views; two pixels leave room for the 1px outline. */
export function fittedSpan(
  views: readonly ProjectedBounds[],
  scale: number,
): number {
  let span = 0;
  for (const bounds of views) {
    span = Math.max(
      span,
      (Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX)) * FRAME_SIZE) /
        (FRAME_SIZE / 2 - 2),
      (bounds.maxY * FRAME_SIZE) / (GROUND_PIXEL - 2),
    );
  }
  return span / scale;
}
