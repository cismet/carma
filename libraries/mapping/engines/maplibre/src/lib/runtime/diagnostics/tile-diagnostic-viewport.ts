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
    // A degenerate plane (an infinite far plane, for instance) carries no
    // normal to intersect; every other one, the far plane included, bounds a
    // face of the clipped volume and owns edges worth drawing.
    const planes = frustum.planes.filter(
      (plane) => plane.normal.lengthSq() > 1e-12
    );
    for (let axis = 0; axis < 3; axis++) {
      const normal = new THREE.Vector3().setComponent(axis, 1);
      planes.push(new THREE.Plane(normal, -extent.min.getComponent(axis)));
      planes.push(
        new THREE.Plane(normal.clone(), -extent.max.getComponent(axis))
      );
    }
    const emitted = new Set<string>();
    // Every pair, the box's own faces included. Where the frustum reaches past
    // the box, as a near plane at the eye and a far plane beyond the horizon
    // do, the cut ends on a face of the box: leaving those pairs out left the
    // outline open at exactly the ends the eye looks along.
    for (let i = 0; i < planes.length; i++) {
      for (let j = i + 1; j < planes.length; j++) {
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
    // The overview is a plan view: an edge along the vertical axis collapses to
    // a point, and the top and bottom faces of a box project onto each other.
    // Drop the first and keep one of the second, so the outline is drawn once.
    const seen = new Set<string>();
    intersectionEdges = segments.filter(([x0, y0, x1, y1]) => {
      // Only an edge along the discarded axis collapses to a point. A short
      // one is the connector between two long rails, and dropping it by length
      // is what left the outline as loose horizontal strokes.
      if (Math.hypot(x1 - x0, y1 - y0) < 1e-6) return false;
      const key = [x0, y0, x1, y1].map((value) => value.toFixed(2)).join(":");
      const reverse = [x1, y1, x0, y0]
        .map((value) => value.toFixed(2))
        .join(":");
      if (seen.has(key) || seen.has(reverse)) return false;
      seen.add(key);
      return true;
    });
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
          Math.max(
            1,
            extent.getSize(new THREE.Vector3()).length() * 0.25
          )
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
    // A retained ancestor spans far past the framed area: its cut crosses the
    // whole overview as a line whose ends lie outside it, which reads as a
    // stray horizontal. Its children carry the detail, so skip it.
    const framedSpan =
      Math.max(
        basis.bounds[3] - basis.bounds[0],
        basis.bounds[5] - basis.bounds[2]
      ) * 1.5;
    views.forEach((view, cameraIndex) => {
      const segments: number[] = [];
      for (let i = 0; i < tileBounds.length; i += 6) {
        if (
          Math.max(
            tileBounds[i + 3] - tileBounds[i],
            tileBounds[i + 5] - tileBounds[i + 2]
          ) > framedSpan
        )
          continue;
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
