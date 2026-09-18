import { OrthographicCamera, PerspectiveCamera, Plane, Vector3 } from "three";
import { radToDegNumeric } from "@carma-units";
import { getSignedPolygonArea2d } from "@carma-commons/math";

export const CYLINDER_CAMERA_RIG_MODE = {
  PANORAMA: "panorama",
  OBJECT_COVER: "object-cover",
} as const;

export type CylinderCameraRigMode =
  (typeof CYLINDER_CAMERA_RIG_MODE)[keyof typeof CYLINDER_CAMERA_RIG_MODE];

export type CameraRigView = Readonly<{
  id: string;
  camera: PerspectiveCamera | OrthographicCamera;
  clipPlanes: readonly Plane[];
  distance: number;
  stripWidthMeters?: number;
  imagePlaneVerticalOffset?: number;
}>;

export type SpineSample = Readonly<{
  position: Vector3;
  tangent: Vector3;
  totalLength: number;
}>;

export type CameraStripLayout = Readonly<{
  width: number;
  height: number;
  offsets: readonly number[];
  widths: readonly number[];
}>;

type SpineSegment = Readonly<{
  start: Vector3;
  end: Vector3;
  tangent: Vector3;
  length: number;
  distance: number;
}>;

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

const assertFiniteVector = (value: Vector3, name: string) => {
  if (![value.x, value.y, value.z].every(Number.isFinite))
    throw new Error(`${name} must be finite`);
};

export const getCameraStripLayout = (
  views: readonly CameraRigView[],
  requestedHeight: number,
  maxTotalWidth = 16_384
): CameraStripLayout => {
  if (
    views.length === 0 ||
    !finitePositive(requestedHeight) ||
    !finitePositive(maxTotalWidth)
  )
    throw new Error("Invalid camera strip layout options");
  const widthBudget = Math.floor(maxTotalWidth);
  if (widthBudget < views.length)
    throw new Error("Camera strip width cap is smaller than the view count");
  const aspects = views.map(({ camera }) => {
    const aspect =
      camera instanceof PerspectiveCamera
        ? camera.aspect
        : (camera.right - camera.left) / (camera.top - camera.bottom);
    if (!finitePositive(aspect)) throw new Error("Invalid camera aspect");
    return aspect;
  });
  const aspectSum = aspects.reduce((sum, aspect) => sum + aspect, 0);
  const height = Math.max(
    1,
    Math.floor(Math.min(requestedHeight, widthBudget / aspectSum))
  );
  const targetWidth = Math.max(
    views.length,
    Math.min(widthBudget, Math.round(height * aspectSum))
  );
  const exactWidths = aspects.map(
    (aspect) => (targetWidth * aspect) / aspectSum
  );
  const widths = exactWidths.map((width) => Math.max(1, Math.floor(width)));
  let delta = targetWidth - widths.reduce((sum, width) => sum + width, 0);
  const order = exactWidths
    .map((width, index) => ({ index, remainder: width - Math.floor(width) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let cursor = 0; delta > 0; cursor += 1, delta -= 1)
    widths[order[cursor % order.length].index] += 1;
  for (
    let cursor = order.length - 1;
    delta < 0;
    cursor = (cursor + order.length - 1) % order.length
  ) {
    const index = order[(cursor + order.length) % order.length].index;
    if (widths[index] <= 1) continue;
    widths[index] -= 1;
    delta += 1;
  }
  const offsets: number[] = [];
  let width = 0;
  for (const viewWidth of widths) {
    offsets.push(width);
    width += viewWidth;
  }
  return { width, height, offsets, widths };
};

const compileSpine = (
  points: readonly Vector3[],
  closed: boolean,
  mergeAngleThreshold = 0
) => {
  if (points.length < (closed ? 3 : 2))
    throw new Error("Spine has too few points");
  points.forEach((point) => assertFiniteVector(point, "Spine point"));

  const segments: SpineSegment[] = [];
  let totalLength = 0;
  const pairCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < pairCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const delta = end.clone().sub(start);
    const length = Math.hypot(delta.x, delta.z);
    if (length === 0) continue;
    const tangent = new Vector3(delta.x / length, 0, delta.z / length);
    segments.push({ start, end, tangent, length, distance: totalLength });
    totalLength += length;
  }
  if (!finitePositive(totalLength)) throw new Error("Spine has zero length");
  if (mergeAngleThreshold === 0) return { segments, totalLength };

  // Decision: group only a bounded heading range, not just adjacent turns.
  // Gentle successive bends must not collapse an entire river meander.
  // MULTICAM-STRESS-20260913, engines/maplibre/README.md.
  const grouped: SpineSegment[] = [];
  let firstDirection = segments[0].tangent;
  let minHeading = 0;
  let maxHeading = 0;
  for (const segment of segments) {
    const heading = Math.atan2(
      firstDirection.x * segment.tangent.z -
        firstDirection.z * segment.tangent.x,
      firstDirection.dot(segment.tangent)
    );
    const nextMin = Math.min(minHeading, heading);
    const nextMax = Math.max(maxHeading, heading);
    const previous = grouped[grouped.length - 1];
    if (previous && nextMax - nextMin <= mergeAngleThreshold + 1e-12) {
      const delta = segment.end.clone().sub(previous.start);
      const length = Math.hypot(delta.x, delta.z);
      grouped[grouped.length - 1] = {
        start: previous.start,
        end: segment.end,
        tangent: new Vector3(delta.x / length, 0, delta.z / length),
        length,
        distance: previous.distance,
      };
      minHeading = nextMin;
      maxHeading = nextMax;
    } else {
      grouped.push({ ...segment, distance: 0 });
      firstDirection = segment.tangent;
      minHeading = 0;
      maxHeading = 0;
    }
  }
  totalLength = 0;
  const indexed = grouped.map((segment) => {
    const next = { ...segment, distance: totalLength };
    totalLength += segment.length;
    return next;
  });
  return { segments: indexed, totalLength };
};

const sampleCompiledSpine = (
  segments: readonly SpineSegment[],
  totalLength: number,
  closed: boolean,
  distance: number
): SpineSample => {
  if (!Number.isFinite(distance)) throw new Error("Distance must be finite");
  const boundedDistance = closed
    ? ((distance % totalLength) + totalLength) % totalLength
    : Math.min(totalLength, Math.max(0, distance));
  const segment =
    segments.find(
      ({ distance: start, length }) => boundedDistance < start + length
    ) ?? segments[segments.length - 1];
  const fraction = Math.min(
    1,
    Math.max(0, (boundedDistance - segment.distance) / segment.length)
  );
  return {
    position: segment.start.clone().lerp(segment.end, fraction),
    tangent: segment.tangent.clone(),
    totalLength,
  };
};

export const sampleSpine = (
  points: readonly Vector3[],
  closed: boolean,
  distance: number
): SpineSample => {
  const { segments, totalLength } = compileSpine(points, closed);
  return sampleCompiledSpine(segments, totalLength, closed, distance);
};

// Decision MULTICAM-STRESS-20260913 (engine README): offset supporting lines,
// not a radial scale about the centroid, which cannot guarantee edge clearance.
const offsetConvexFootprint = (
  points: readonly Vector3[],
  clearance: number
) => {
  points.forEach((point) => assertFiniteVector(point, "Footprint point"));
  const samePosition = (a: Vector3, b: Vector3) =>
    Math.hypot(a.x - b.x, a.z - b.z) < 1e-8;
  const ring = points.filter(
    (point, index) => !index || !samePosition(point, points[index - 1])
  );
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1]))
    ring.pop();
  if (ring.length < 3) throw new Error("Closed footprint needs three vertices");
  let area = getSignedPolygonArea2d(ring.map(({ x, z }) => ({ x, y: z })));
  if (Math.abs(area) < 1e-8) throw new Error("Footprint has zero area");
  // Clockwise XZ traversal makes each inward image's right edge meet the next
  // image's left edge. Opposite source winding must not reverse strip order.
  if (area > 0) {
    ring.reverse();
    area = -area;
  }
  const winding = Math.sign(area);
  const normals = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length];
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    if (length < 1e-8) throw new Error("Footprint has a repeated vertex");
    return new Vector3(
      (winding * (next.z - point.z)) / length,
      0,
      (-winding * (next.x - point.x)) / length
    );
  });
  // This option deliberately accepts convex envelopes only, not an arbitrary
  // concave polygon whose outward mitres could self-intersect.
  ring.forEach((point, index) => {
    if (
      ring.some(
        (candidate) => normals[index].dot(candidate.clone().sub(point)) > 1e-4
      )
    )
      throw new Error("Closed footprint must be convex");
  });
  return {
    original: ring,
    outwardSide: -winding,
    points: ring.map((point, index) => {
      const previous = normals[(index + ring.length - 1) % ring.length];
      const current = normals[index];
      const denominator = 1 + previous.dot(current);
      if (denominator < 1e-8) throw new Error("Footprint corner is degenerate");
      return point
        .clone()
        .addScaledVector(
          previous.clone().add(current),
          clearance / denominator
        );
    }),
  };
};

const fitFootprintFar = (
  camera: OrthographicCamera,
  footprint: readonly Vector3[],
  padding: number,
  emptyStripDepth: number
) => {
  // Clip in camera-space X to this strip; a remote corner outside the strip
  // must not push its far plane through the next block of buildings.
  let polygon = footprint.map((point) =>
    point.clone().applyMatrix4(camera.matrixWorldInverse)
  );
  for (const [boundary, sign] of [
    [camera.left, 1],
    [camera.right, -1],
  ]) {
    const clipped: Vector3[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const a = sign * (start.x - boundary),
        b = sign * (end.x - boundary);
      if (a >= 0) clipped.push(start);
      if (a >= 0 !== b >= 0) clipped.push(start.clone().lerp(end, a / (a - b)));
    }
    polygon = clipped;
  }
  // Offset mitres can create narrow fringe strips outside the original hull.
  // Keep those bounded at the front margin instead of loading the next block.
  const far =
    (polygon.length
      ? Math.max(...polygon.map((point) => -point.z))
      : emptyStripDepth) + padding;
  if (!Number.isFinite(far) || far <= camera.near)
    throw new Error("Footprint is behind its camera");
  camera.far = far;
  camera.updateProjectionMatrix();
};

export const createCylinderCameraRig = ({
  center,
  radius,
  height,
  count,
  mode,
  aspect,
  near,
  far,
  verticalFieldOfView,
  pitch = 0,
  referenceDepth,
}: Readonly<{
  center: Vector3;
  radius: number;
  height: number;
  count: number;
  mode: CylinderCameraRigMode;
  aspect: number;
  near: number;
  far: number;
  /**
   * Nominal symmetric vertical field of view in radians, before lens shift.
   * With pitch, the angular endpoints are asymmetric around the shifted horizon.
   */
  verticalFieldOfView?: number;
  /** Vertical lens shift expressed as a horizon angle in radians. */
  pitch?: number;
  /** Inward orthographic reference wall depth from the camera cylinder.
   * Defaults to half the radius. Perspective panoramas use their tangent wall. */
  referenceDepth?: number;
}>): CameraRigView[] => {
  assertFiniteVector(center, "Center");
  if (
    !Number.isInteger(count) ||
    count < 3 ||
    ![radius, height, aspect, near, far].every(finitePositive) ||
    far <= near ||
    !Number.isFinite(pitch) ||
    Math.abs(pitch) >= Math.PI / 2 ||
    (verticalFieldOfView !== undefined &&
      (!finitePositive(verticalFieldOfView) ||
        verticalFieldOfView >= Math.PI)) ||
    (mode !== CYLINDER_CAMERA_RIG_MODE.PANORAMA &&
      mode !== CYLINDER_CAMERA_RIG_MODE.OBJECT_COVER)
  )
    throw new Error("Invalid cylinder camera rig options");

  const horizontalFieldOfView = (Math.PI * 2) / count;
  const objectDepth = referenceDepth ?? radius / 2;
  if (
    mode === CYLINDER_CAMERA_RIG_MODE.OBJECT_COVER &&
    (!Number.isFinite(objectDepth) ||
      objectDepth <= near ||
      objectDepth >= Math.min(radius, far))
  )
    throw new Error(
      "Object reference wall must be inside the camera cylinder and its depth range"
    );
  // The inward wall's apothem is radius-depth, not radius. Using the outer
  // cylinder width at the centre made all image planes cross one another.
  const width = 2 * (radius - objectDepth) * Math.tan(Math.PI / count);
  return Array.from({ length: count }, (_, index) => {
    const angle = index * horizontalFieldOfView;
    const outward = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangentPoint = center.clone().addScaledVector(outward, radius);
    let camera: PerspectiveCamera | OrthographicCamera;
    let clipPlane: Plane;
    if (mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA) {
      const verticalFov =
        verticalFieldOfView ??
        2 * Math.atan(Math.tan(horizontalFieldOfView / 2) / aspect);
      const sliceAspect =
        Math.tan(horizontalFieldOfView / 2) / Math.tan(verticalFov / 2);
      camera = new PerspectiveCamera(
        radToDegNumeric(verticalFov)!,
        sliceAspect,
        near,
        far
      );
      camera.position.copy(center);
      camera.lookAt(center.clone().add(outward));
      // Decision: shift parallel vertical image planes, rather than tilting
      // each segment independently and opening seams above/below the horizon.
      if (pitch !== 0)
        camera.setViewOffset(
          sliceAspect,
          1,
          0,
          -Math.tan(pitch) / (2 * Math.tan(verticalFov / 2)),
          sliceAspect,
          1
        );
      clipPlane = new Plane().setFromNormalAndCoplanarPoint(
        outward,
        tangentPoint
      );
    } else {
      camera = new OrthographicCamera(
        -width / 2,
        width / 2,
        height / 2,
        -height / 2,
        near,
        far
      );
      camera.position.copy(tangentPoint);
      camera.lookAt(center);
      clipPlane = new Plane().setFromNormalAndCoplanarPoint(
        outward.clone().negate(),
        tangentPoint
      );
    }
    camera.updateProjectionMatrix();
    camera.updateWorldMatrix(true, false);
    return {
      id: `cylinder-${mode}-${index}`,
      camera,
      clipPlanes: [clipPlane],
      distance:
        mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA ? radius : objectDepth,
      imagePlaneVerticalOffset:
        mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA
          ? radius * Math.tan(pitch)
          : 0,
    };
  });
};

export const createSpineCameraRig = ({
  points,
  closed,
  count,
  height,
  offset,
  near,
  far,
  clipBeforeSurface,
  side,
  verticalRange,
  verticalPadding = 0,
  mergeAngleThreshold = 0,
  closedFootprint,
  corridorFootprint,
  screenOrder = false,
  upsideDown = false,
  referenceSurfaceOffset = 0,
  baselineElevation = points[0]?.y ?? 0,
}: Readonly<{
  points: readonly Vector3[];
  closed: boolean;
  count: number;
  height: number;
  offset: number;
  near: number;
  far: number;
  clipBeforeSurface: number;
  side: 1 | -1;
  /** Return open-spine cameras in screen-left to screen-right order, so a
   * back-facing array has continuous image seams without mirrored pixels. */
  screenOrder?: boolean;
  /** Rotate the image plane by half a turn for an unfolded opposite facade.
   * This preserves handedness/culling and needs no pixel copy or second pass. */
  upsideDown?: boolean;
  /** Metres from the spine in the viewing direction. A scalar applies to all
   * segments; an array addresses retained segments before interval subdivision.
   * Adjacent reference panels meet at their supporting-line intersection.
   * Not a promise of seamless orthographic imagery at other depths. */
  referenceSurfaceOffset?: number | readonly number[];
  /** One scene-space elevation for the entire wall. Vertex elevations never
   * stagger individual panels. An explicit verticalRange takes precedence. */
  baselineElevation?: number;
  verticalRange?: readonly [minimum: number, maximum: number];
  verticalPadding?: number;
  /** Radians. Merge near-straight edges only within this total heading range. */
  mergeAngleThreshold?: number;
  /** Convex closed envelope in scene metres. Fits far per strip instead of `far`,
   * derives the outward side, and orders strips clockwise in XZ. */
  closedFootprint?: Readonly<{ clearance: number; backPadding: number }>;
  /** Open corridor boundary, fitted in each strip's camera space. Includes
   * a margin beyond the opposite bank for bridge abutments, not distant blocks. */
  corridorFootprint?: Readonly<{
    points: readonly Vector3[];
    backPadding: number;
    /** Points are the opposite bank, one per spine vertex. Fit only the local
     * section so a distant meander cannot extend this camera's far plane. */
    pairedToSpine?: boolean;
  }>;
}>): CameraRigView[] => {
  if (
    !Number.isInteger(count) ||
    !Number.isFinite(baselineElevation) ||
    count < 1 ||
    ![height, offset, near, far].every(finitePositive) ||
    !Number.isFinite(clipBeforeSurface) ||
    clipBeforeSurface < 0 ||
    far <= near ||
    clipBeforeSurface >= offset ||
    !Number.isFinite(verticalPadding) ||
    verticalPadding < 0 ||
    !Number.isFinite(mergeAngleThreshold) ||
    mergeAngleThreshold < 0 ||
    mergeAngleThreshold >= Math.PI / 2 ||
    (verticalRange !== undefined &&
      (!verticalRange.every(Number.isFinite) ||
        verticalRange[1] <= verticalRange[0])) ||
    (side !== 1 && side !== -1)
  )
    throw new Error("Invalid spine camera rig options");
  if (
    corridorFootprint &&
    (closed ||
      corridorFootprint.points.length <
        (corridorFootprint.pairedToSpine ? 2 : 3) ||
      corridorFootprint.points.some(
        (point) => !point.toArray().every(Number.isFinite)
      ) ||
      !Number.isFinite(corridorFootprint.backPadding) ||
      corridorFootprint.backPadding < 0)
  )
    throw new Error(
      "Corridor footprint requires a finite open corridor boundary"
    );
  if (
    corridorFootprint?.pairedToSpine &&
    corridorFootprint.points.length !== points.length
  )
    throw new Error("Opposite bank must have one point per spine vertex");
  if (
    closedFootprint &&
    (!closed ||
      mergeAngleThreshold !== 0 ||
      !Number.isFinite(closedFootprint.clearance) ||
      closedFootprint.clearance < 2 ||
      !Number.isFinite(closedFootprint.backPadding) ||
      closedFootprint.backPadding < 0)
  )
    throw new Error(
      "Closed footprint requires at least 2 m clearance and unmerged closed edges"
    );
  const envelope = closedFootprint
    ? offsetConvexFootprint(points, closedFootprint.clearance)
    : null;
  const { segments, totalLength } = compileSpine(
    envelope?.points ?? points,
    closed,
    mergeAngleThreshold
  );
  const surfaceOffsets =
    typeof referenceSurfaceOffset === "number"
      ? segments.map(() => referenceSurfaceOffset)
      : referenceSurfaceOffset;
  if (
    surfaceOffsets.length !== segments.length ||
    !surfaceOffsets.every(Number.isFinite)
  )
    throw new Error(
      "Reference surface requires one finite offset per retained segment"
    );
  const normals = segments.map(
    ({ tangent }) =>
      new Vector3(
        -tangent.z * (envelope?.outwardSide ?? side),
        0,
        tangent.x * (envelope?.outwardSide ?? side)
      )
  );
  // Decision: joined reference panels, not independent shifted rectangles.
  // ORTHOGRAPHIC-REFERENCE-SEAMS-20260916, engines/maplibre/README.md.
  // Orthographic rays cannot share a seam at every depth around a bend.
  const joints = segments.map((segment, index) => {
    const current = normals[index];
    const shift = surfaceOffsets[index];
    if (!closed && index === 0)
      return segment.start.clone().addScaledVector(current, -shift);
    const previousIndex = (index + segments.length - 1) % segments.length;
    const previous = normals[previousIndex];
    const previousShift = surfaceOffsets[previousIndex];
    const determinant = previous.x * current.z - previous.z * current.x;
    if (Math.abs(determinant) < 1e-8) {
      if (Math.abs(previousShift - shift * previous.dot(current)) > 1e-6)
        throw new Error("Parallel reference panels need compatible offsets");
      return segment.start.clone().addScaledVector(current, -shift);
    }
    const dx = (-previousShift * current.z + shift * previous.z) / determinant;
    const dz = (-shift * previous.x + previousShift * current.x) / determinant;
    // Do not silently clamp a mitre: that would introduce a hidden gap.
    if (
      Math.hypot(dx, dz) >
      4 * Math.max(1, Math.abs(shift), Math.abs(previousShift))
    )
      throw new Error(
        "Reference surface mitre exceeds its safe limit; reduce the offset at this bend"
      );
    return segment.start.clone().add(new Vector3(dx, 0, dz));
  });
  if (!closed)
    joints.push(
      segments
        .at(-1)!
        .end.clone()
        .addScaledVector(normals.at(-1)!, -surfaceOffsets.at(-1)!)
    );
  const actualCount = Math.max(count, segments.length);
  const remainingCount = actualCount - segments.length;
  const allocations = segments.map((segment) => {
    const quota = (remainingCount * segment.length) / totalLength;
    return { count: 1 + Math.floor(quota), remainder: quota % 1 };
  });
  let leftovers =
    actualCount -
    allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  const remainderOrder = allocations
    .map(({ remainder }, index) => ({ index, remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < leftovers; index += 1)
    allocations[remainderOrder[index].index].count += 1;

  const views: CameraRigView[] = [];
  for (
    let segmentIndex = 0;
    segmentIndex < segments.length;
    segmentIndex += 1
  ) {
    const segment = segments[segmentIndex];
    const referenceStart = joints[segmentIndex];
    const referenceEnd = joints[(segmentIndex + 1) % joints.length];
    const referenceLength = referenceEnd
      .clone()
      .sub(referenceStart)
      .dot(segment.tangent);
    if (!finitePositive(referenceLength))
      throw new Error(
        "Reference surface folds over a segment; reduce the offset"
      );
    const localFootprint = corridorFootprint?.pairedToSpine
      ? [
          ...points.slice(
            points.indexOf(segment.start),
            points.indexOf(segment.end) + 1
          ),
          ...corridorFootprint.points
            .slice(
              points.indexOf(segment.start),
              points.indexOf(segment.end) + 1
            )
            .reverse(),
        ]
      : corridorFootprint?.points;
    const segmentCount = allocations[segmentIndex].count;
    const intervalLength = segment.length / segmentCount;
    for (
      let intervalIndex = 0;
      intervalIndex < segmentCount;
      intervalIndex += 1
    ) {
      const distance =
        segment.distance + (intervalIndex + 0.5) * intervalLength;
      const sample = sampleCompiledSpine(
        segments,
        totalLength,
        closed,
        distance
      );
      const normal = normals[segmentIndex];
      const referenceDepth = offset + surfaceOffsets[segmentIndex];
      const referenceCenter = referenceStart
        .clone()
        .lerp(referenceEnd, (intervalIndex + 0.5) / segmentCount);
      referenceCenter.y = baselineElevation;
      const referenceWidth = referenceLength / segmentCount;
      const framedHeight = verticalRange
        ? verticalRange[1] - verticalRange[0] + 2 * verticalPadding
        : height + 2 * verticalPadding;
      if (verticalRange)
        referenceCenter.y = (verticalRange[0] + verticalRange[1]) / 2;
      const camera = new OrthographicCamera(
        -referenceWidth / 2,
        referenceWidth / 2,
        framedHeight / 2,
        -framedHeight / 2,
        near,
        far
      );
      camera.position
        .copy(referenceCenter)
        .addScaledVector(normal, referenceDepth);
      camera.lookAt(referenceCenter);
      if (upsideDown) camera.rotateZ(Math.PI);
      camera.updateProjectionMatrix();
      camera.updateWorldMatrix(true, false);
      if (envelope && closedFootprint)
        fitFootprintFar(
          camera,
          envelope.original,
          closedFootprint.backPadding,
          offset + closedFootprint.clearance
        );
      if (corridorFootprint)
        fitFootprintFar(
          camera,
          localFootprint!,
          corridorFootprint.backPadding,
          offset
        );
      if (referenceDepth <= camera.near || referenceDepth >= camera.far)
        throw new Error("Reference surface must lie between near and far");
      // Framing depth must not move the independent foreground cut.
      const clipPoint = sample.position
        .clone()
        .addScaledVector(normal, clipBeforeSurface);
      const clipPlane = new Plane().setFromNormalAndCoplanarPoint(
        normal.clone().negate(),
        clipPoint
      );
      views.push({
        id: `spine-${closed ? "closed" : "open"}-${side}-${views.length}`,
        camera,
        clipPlanes: [clipPlane],
        distance: referenceDepth,
        stripWidthMeters: referenceWidth,
      });
    }
  }
  return screenOrder && !closed && (side === -1) !== upsideDown
    ? views.reverse()
    : views;
};
