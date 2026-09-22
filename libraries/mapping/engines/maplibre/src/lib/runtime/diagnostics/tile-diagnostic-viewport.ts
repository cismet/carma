import * as THREE from "three";
import { intersectTileFrustumPlanes } from "../../core/diagnostics/tile-frustum-cuts";
import {
  createTileCameraDemand,
  type TileCameraSnapshot,
} from "../../core/tile-camera-demand";
import type {
  DiagnosticViewportBasis,
  OverlayModel,
} from "../../core/diagnostics/tile-diagnostic-model";

/** Worker-side projection against the snapshot boxes; never touches live tiles. */
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
  const tileBounds = basis.tileBounds ?? basis.bounds;
  const vertices: THREE.Vector3[] = [];
  const fitBox = new THREE.Box3();
  const fitTransform = new THREE.Matrix4();
  // Crop to the same presented volumes that produce the cuts, not the
  // city-wide ancestor's deep underside. This also handles contained tiles.
  for (let offset = 0; offset + 5 < tileBounds.length; offset += 6) {
    fitBox.min.fromArray(tileBounds, offset);
    fitBox.max.fromArray(tileBounds, offset + 3);
    if (basis.tileTransforms)
      fitTransform.fromArray(basis.tileTransforms, (offset / 6) * 16);
    else fitTransform.identity();
    if (!frustum.intersectsBox(fitBox.clone().applyMatrix4(fitTransform)))
      continue;
    vertices.push(
      ...demand.intersectionVertices(fitBox, undefined, fitTransform)
    );
  }
  const focusWorld = vertices.length
    ? new THREE.Box3()
        .setFromPoints(vertices)
        .getCenter(new THREE.Vector3())
        .toArray()
    : null;
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

  const outline = new Float32Array(intersectionEdges?.flat() ?? []);
  {
    const segments = new Map<string, [number, number, number, number]>();
    const box = new THREE.Box3();
    const transform = new THREE.Matrix4();
    for (let offset = 0; offset + 5 < tileBounds.length; offset += 6) {
      box.min.fromArray(tileBounds, offset);
      box.max.fromArray(tileBounds, offset + 3);
      if (basis.tileTransforms)
        transform.fromArray(basis.tileTransforms, (offset / 6) * 16);
      else transform.identity();
      for (const edge of intersectTileFrustumPlanes(box, frustum, transform)) {
        const a = edge.start.applyMatrix4(worldToOverview);
        const b = edge.end.applyMatrix4(worldToOverview);
        const first = toScreen(a.x, a.z),
          last = toScreen(b.x, b.z);
        if (
          !first.concat(last).every(Number.isFinite) ||
          Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-7
        )
          continue;
        const key = [first, last]
          .map((point) => point.map((value) => value.toFixed(6)).join(","))
          .sort()
          .join(";");
        segments.set(key, [...first, ...last]);
      }
    }
    intersectionEdges = [...segments.values()];
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
  const overviewMatrix = worldToOverview.elements;
  const affineOverview =
    overviewMatrix[3] === 0 &&
    overviewMatrix[7] === 0 &&
    overviewMatrix[11] === 0 &&
    overviewMatrix[15] !== 0;
  let nearCenter: [number, number] | undefined;
  // Only the light direction marker needs a separately projected near centre.
  if (affineOverview) {
    // Preserve asymmetric bounds and the camera depth convention.
    const clipToWorld = cameraMatrix
      .clone()
      .multiply(
        new THREE.Matrix4().fromArray(camera.projectionMatrix).invert()
      );
    const nearZ = camera.reversedDepth
      ? 1
      : camera.coordinateSystem === THREE.WebGPUCoordinateSystem
      ? 0
      : -1;
    const nearPoint = new THREE.Vector3(0, 0, nearZ)
      .applyMatrix4(clipToWorld)
      .applyMatrix4(worldToOverview);
    nearCenter = toScreen(nearPoint.x, nearPoint.z);
  }
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
  return {
    focusWorld,
    nearCenter,
    forward:
      forwardLength > 1e-6
        ? ([
            (aheadScreen[0] - eyeScreen[0]) / forwardLength,
            (aheadScreen[1] - eyeScreen[1]) / forwardLength,
          ] as [number, number])
        : null,
    edges: new Float32Array(intersectionEdges?.flat() ?? []),
    outline,
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
  paddingPercent = 200,
  orbit?: { yaw: number; pitch: number }
) => {
  // The pivot comes from the actual clipped, content-bearing frustum volume.
  // Rotating the world projection leaves the loader's camera tests untouched.
  const baseViews = cameras.map((camera) => ({
    id: camera.id,
    ...projectTileDiagnosticViewport(basis, camera, paddingPercent),
  }));
  const pivotViews =
    focus === "all" ? baseViews : baseViews.filter((view) => view.id === focus);
  const pivotPoints = pivotViews.flatMap((view) =>
    view.focusWorld ? [new THREE.Vector3().fromArray(view.focusWorld)] : []
  );
  const pivot = pivotPoints.length
    ? new THREE.Box3().setFromPoints(pivotPoints).getCenter(new THREE.Vector3())
    : new THREE.Box3(
        new THREE.Vector3().fromArray(basis.bounds),
        new THREE.Vector3().fromArray(basis.bounds, 3)
      ).getCenter(new THREE.Vector3());
  const origin = new THREE.Matrix4().fromArray(basis.worldToOverview);
  const pivotOverview = pivot.clone().applyMatrix4(origin);
  const rotatedBasis =
    orbit && (orbit.yaw !== 0 || orbit.pitch !== 0)
      ? {
          ...basis,
          worldToOverview: new THREE.Matrix4()
            .makeTranslation(pivotOverview.x, pivotOverview.y, pivotOverview.z)
            .multiply(new THREE.Matrix4().makeRotationX(orbit.pitch))
            .multiply(new THREE.Matrix4().makeRotationY(orbit.yaw))
            .multiply(
              new THREE.Matrix4().makeTranslation(
                -pivotOverview.x,
                -pivotOverview.y,
                -pivotOverview.z
              )
            )
            .multiply(origin)
            .toArray(),
        }
      : basis;
  const views =
    rotatedBasis === basis
      ? baseViews
      : cameras.map((camera) => ({
          id: camera.id,
          ...projectTileDiagnosticViewport(
            rotatedBasis,
            camera,
            paddingPercent
          ),
        }));
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
  return { views, view, basis: rotatedBasis };
};
