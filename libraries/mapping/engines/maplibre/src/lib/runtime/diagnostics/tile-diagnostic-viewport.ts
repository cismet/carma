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
  // A fourth entry carries a vertical scale of its own, which the camera
  // projection needs: its two axes differ and its vertical one is flipped.
  const [scale, offsetX, offsetY, scaleY = scale] = basis.screen;
  const toScreen = (x: number, z: number): [number, number] => [
    offsetX + x * scale,
    offsetY + z * scaleY,
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
    // The outline of the clipped volume as it reads in this projection: the
    // hull of its projected corners. Recovering the 3D wireframe from pairs of
    // supporting planes drew edges that collapse, coincide or leave the frame,
    // which is what the loose strokes were; a hull is closed by construction.
    const projected = vertices.map((point) => {
      const p = point.clone().applyMatrix4(worldToOverview);
      return toScreen(p.x, p.z);
    });
    const ordered = [...projected].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turnsRight = (
      o: readonly [number, number],
      a: readonly [number, number],
      b: readonly [number, number]
    ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]) <= 1e-9;
    const half = (points: Array<[number, number]>) => {
      const chain: Array<[number, number]> = [];
      for (const point of points) {
        while (
          chain.length >= 2 &&
          turnsRight(chain[chain.length - 2], chain[chain.length - 1], point)
        )
          chain.pop();
        chain.push(point);
      }
      chain.pop();
      return chain;
    };
    const hull = [...half(ordered), ...half([...ordered].reverse())];
    // A cut can be a sliver: the hull of nearly collinear corners is a line
    // traced out and back, which draws as a loose stroke. Twice the area of
    // the polygon says whether there is a shape to draw at all.
    const twiceArea = Math.abs(
      hull.reduce((sum, point, index) => {
        const next = hull[(index + 1) % hull.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0)
    );
    // Area alone still passes a long thin sliver: two hundred pixels of length
    // at a fiftieth of a pixel of width is the loose stroke again. Divide by
    // the longest side to get the mean width and ask for a pixel of it.
    const hullSpan = Math.max(
      1,
      Math.max(...hull.map(([x]) => x)) - Math.min(...hull.map(([x]) => x)),
      Math.max(...hull.map(([, y]) => y)) - Math.min(...hull.map(([, y]) => y))
    );
    intersectionEdges =
      hull.length >= 3 && twiceArea / hullSpan >= 2
        ? hull.map((point, index) => {
            const next = hull[(index + 1) % hull.length];
            return [point[0], point[1], next[0], next[1]] as [
              number,
              number,
              number,
              number
            ];
          })
        : null;
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
  // The eye itself, so an edge can be drawn wider where it is near the camera.
  const cameraMatrix = new THREE.Matrix4().fromArray(camera.matrixWorld);
  const eyeWorld = new THREE.Vector3().setFromMatrixPosition(cameraMatrix);
  const eye = eyeWorld.clone().applyMatrix4(worldToOverview);
  // Where this camera looks, in the same screen frame as the cut: a light's
  // arrow follows this, not the offset of an edge from the eye.
  const aheadWorld = eyeWorld
    .clone()
    .add(
      new THREE.Vector3(
        -camera.matrixWorld[8],
        -camera.matrixWorld[9],
        -camera.matrixWorld[10]
      )
        .normalize()
        .multiplyScalar(
          Math.max(1, extent.getSize(new THREE.Vector3()).length() * 0.25)
        )
    )
    .applyMatrix4(worldToOverview);
  const eyeScreen = toScreen(eye.x, eye.z);
  const aheadScreen = toScreen(aheadWorld.x, aheadWorld.z);
  const forwardLength = Math.hypot(
    aheadScreen[0] - eyeScreen[0],
    aheadScreen[1] - eyeScreen[1]
  );
  const forwardWorld = new THREE.Vector3(
    -camera.matrixWorld[8],
    -camera.matrixWorld[9],
    -camera.matrixWorld[10]
  ).normalize();
  return {
    /** Angle between where this camera looks and straight down. */
    nadirRadians: Math.acos(
      Math.min(1, Math.max(-1, forwardWorld.dot(new THREE.Vector3(0, -1, 0))))
    ),
    forward:
      forwardLength > 1e-6
        ? ([
            (aheadScreen[0] - eyeScreen[0]) / forwardLength,
            (aheadScreen[1] - eyeScreen[1]) / forwardLength,
          ] as [number, number])
        : null,
    edges: new Float32Array(intersectionEdges?.flat() ?? []),
    center: centerHit,
    origin: Number.isFinite(eye.x + eye.z)
      ? (toScreen(eye.x, eye.z) as [number, number])
      : null,
    footprintBounds,
    view,
  };
};

/** All frustums remain visible; focus only changes the overview crop. */
export const projectTileDiagnosticViewports = (
  basis: DiagnosticViewportBasis,
  cameras: readonly TileCameraSnapshot[],
  focus = "overview-live",
  paddingPercent = 200
) => {
  const views = cameras.map((camera) => ({
    id: camera.id,
    ...projectTileDiagnosticViewport(basis, camera, paddingPercent),
  }));
  // Only the outline of the whole cut. Cutting every tile box separately draws
  // a sliver wherever the frustum grazes a flat tile, and a sliver reads as a
  // stray horizontal stroke however it is filtered.
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
