import * as THREE from "three";
import {
  createTileCameraDemand,
  type TileCameraSnapshot,
} from "../../core/tile-camera-demand";
import type {
  DiagnosticViewportBasis,
  OverlayModel,
} from "../../core/diagnostics/tile-diagnostic-model";

/** Worker-side, constant-size camera update. Never walks or reclassifies tiles. */
export const projectTileDiagnosticViewport = (
  basis: DiagnosticViewportBasis,
  camera: TileCameraSnapshot,
  paddingPercent = 200
) => {
  const extent = new THREE.Box3(
    new THREE.Vector3().fromArray(basis.bounds),
    new THREE.Vector3().fromArray(basis.bounds, 3)
  );
  const worldToOverview = new THREE.Matrix4().fromArray(basis.worldToOverview);
  const [scale, offsetX, offsetY] = basis.screen;
  const toScreen = (x: number, z: number): [number, number] => [
    offsetX + x * scale,
    offsetY + z * scale,
  ];
  const demand = createTileCameraDemand([camera]);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4()
      .fromArray(camera.projectionMatrix)
      .multiply(new THREE.Matrix4().fromArray(camera.matrixWorld).invert()),
    camera.coordinateSystem,
    camera.reversedDepth
  );
  let intersectionEdges: OverlayModel["intersectionEdges"] = null;
  let centerHit: [number, number] | null = null;
  let footprintBounds: OverlayModel["footprintBounds"] = null;
  const vertices = demand.intersectionVertices(extent);
  if (vertices.length >= 4) {
    // This is a clipped 3D volume, not rays projected onto guessed ground planes.
    const segments: Array<[number, number, number, number]> = [];
    const projected = vertices.map((point) => {
      const p = point.clone().applyMatrix4(worldToOverview);
      return toScreen(p.x, p.z);
    });
    // Recover edges from their two supporting planes in double precision.
    // Float32 hull geometry loses centimetres at ECEF magnitudes and makes
    // valid side cuts fail the subsequent plane-membership test.
    const tolerance = Math.max(
      1e-7,
      extent.getSize(new THREE.Vector3()).length() * 1e-8,
      ...basis.bounds.map((v) => Math.abs(v) * Number.EPSILON * 128)
    );
    const planes = [...frustum.planes];
    for (let axis = 0; axis < 3; axis++) {
      const normal = new THREE.Vector3().setComponent(axis, 1);
      planes.push(new THREE.Plane(normal, -extent.min.getComponent(axis)));
      planes.push(
        new THREE.Plane(normal.clone(), -extent.max.getComponent(axis))
      );
    }
    const emitted = new Set<string>();
    for (let i = 0; i < 6; i++) {
      if (i === 4) continue;
      for (let j = i + 1; j < planes.length; j++) {
        if (j === 4) continue;
        if (
          new THREE.Vector3()
            .crossVectors(planes[i].normal, planes[j].normal)
            .lengthSq() < 1e-16
        )
          continue;
        const candidates = vertices.flatMap((p, index) =>
          Math.abs(planes[i].distanceToPoint(p)) <= tolerance &&
          Math.abs(planes[j].distanceToPoint(p)) <= tolerance
            ? [index]
            : []
        );
        let pair: number[] = [],
          distance = tolerance * tolerance;
        for (const a of candidates)
          for (const b of candidates) {
            const squared = vertices[a].distanceToSquared(vertices[b]);
            if (squared > distance) {
              distance = squared;
              pair = [a, b];
            }
          }
        if (!pair.length) continue;
        const [a, b] = pair.sort((a, b) => a - b);
        const key = `${a}:${b}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        segments.push([...projected[a], ...projected[b]]);
      }
    }
    intersectionEdges = segments;
    footprintBounds = {
      minX: Math.min(...projected.map((p) => p[0])),
      maxX: Math.max(...projected.map((p) => p[0])),
      minY: Math.min(...projected.map((p) => p[1])),
      maxY: Math.max(...projected.map((p) => p[1])),
    };
    centerHit = [
      (footprintBounds.minX + footprintBounds.maxX) / 2,
      (footprintBounds.minY + footprintBounds.maxY) / 2,
    ];
  }

  const fullView = { x: 0, y: 0, w: basis.width, h: basis.height };
  let view = fullView;
  if (footprintBounds && centerHit) {
    const size =
      Math.max(
        footprintBounds.maxX - footprintBounds.minX,
        footprintBounds.maxY - footprintBounds.minY,
        Number.EPSILON
      ) *
      (Math.max(100, Number.isFinite(paddingPercent) ? paddingPercent : 200) /
        100);
    const aspect = fullView.w / fullView.h;
    const w = aspect >= 1 ? size * aspect : size;
    const h = aspect >= 1 ? size : size / aspect;
    view = { x: centerHit[0] - w / 2, y: centerHit[1] - h / 2, w, h };
  }
  return {
    edges: new Float32Array(intersectionEdges?.flat() ?? []),
    center: centerHit,
    footprintBounds,
    view,
  };
};

/** All frustums remain visible; focus only changes the overview crop. */
export const projectTileDiagnosticViewports = (
  basis: DiagnosticViewportBasis,
  cameras: readonly TileCameraSnapshot[],
  focus = "overview-live",
  paddingPercent = 200,
  tileBounds?: Float64Array
) => {
  const views = cameras.map((camera) => ({
    id: camera.id,
    ...projectTileDiagnosticViewport(basis, camera, paddingPercent),
  }));
  // Keep the global intersection for framing, but draw actual per-tile cuts
  // instead of the distant faces of the tileset-wide bounding volume.
  if (tileBounds) {
    views.forEach((view, cameraIndex) => {
      const segments: number[] = [];
      for (let i = 0; i < tileBounds.length; i += 6) {
        const cut = projectTileDiagnosticViewport(
          { ...basis, bounds: Array.from(tileBounds.subarray(i, i + 6)) },
          cameras[cameraIndex],
          paddingPercent
        );
        for (const coordinate of cut.edges) segments.push(coordinate);
      }
      view.edges = new Float32Array(segments);
    });
  }
  const selected =
    focus === "all" ? views : views.filter((view) => view.id === focus);
  const bounds = selected.flatMap((view) =>
    view.footprintBounds ? [view.footprintBounds] : []
  );
  let view = views[0]?.view ?? { x: 0, y: 0, w: basis.width, h: basis.height };
  if (bounds.length) {
    const minX = Math.min(...bounds.map((b) => b.minX)),
      maxX = Math.max(...bounds.map((b) => b.maxX));
    const minY = Math.min(...bounds.map((b) => b.minY)),
      maxY = Math.max(...bounds.map((b) => b.maxY));
    const aspect = basis.width / Math.max(1, basis.height);
    const padding =
      Math.max(100, Number.isFinite(paddingPercent) ? paddingPercent : 200) /
      100;
    const w = Math.max(maxX - minX, (maxY - minY) * aspect, 1e-6) * padding;
    const h = w / aspect;
    view = { x: (minX + maxX - w) / 2, y: (minY + maxY - h) / 2, w, h };
  }
  return { views, view };
};
