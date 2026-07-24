import * as THREE from "three/webgpu";

export type GeoradarFaceClipRange = {
  min: number;
  max: number;
};

export type GeoradarFaceFrame = {
  surfaceCenterWorld: THREE.Vector3;
  horizontalWorld: THREE.Vector3;
  depthWorld: THREE.Vector3;
  normalWorld: THREE.Vector3;
  horizontalAxis: "x" | "y";
  horizontalDisplayMeters: number;
  horizontalSourceMeters: number;
  horizontalUnitMinimum: number;
  horizontalUnitMaximum: number;
  displayDepthMeters: number;
  sourceDepthMeters: number;
  transverseUnit?: number;
  label: string;
};

export type GeoradarSplineClipFrame = {
  points: Array<{
    world: THREE.Vector3;
    acrossWorld: THREE.Vector3;
    depthWorld: THREE.Vector3;
    unit: number;
  }>;
  plane: GeoradarFaceFrame;
  boundary: "minimum" | "maximum";
  unit: number;
  stationMeters: number;
  traceMinimumMeters: number;
  traceMaximumMeters: number;
  traceCenterMeters: number;
  displayDepthMeters: number;
};

export type GeoradarFaceEditorState = {
  clipX: GeoradarFaceClipRange;
  clipY: GeoradarFaceClipRange;
  clipZ: GeoradarFaceClipRange;
  offsetForwardMeters: number;
  offsetRightMeters: number;
  offsetDownMeters: number;
};

export type GeoradarFaceEditorEdit =
  | {
      kind: "offset";
      offsetForwardMeters: number;
      offsetRightMeters: number;
      offsetDownMeters: number;
    }
  | {
      kind: "clipping";
      clipX: GeoradarFaceClipRange;
      clipY: GeoradarFaceClipRange;
      clipZ: GeoradarFaceClipRange;
    };

type GeoradarFaceEditorCamera =
  | THREE.PerspectiveCamera
  | THREE.OrthographicCamera;

type GeoradarFaceEditorUpdate = {
  camera: GeoradarFaceEditorCamera;
  frame: GeoradarFaceFrame | null;
  splineClips: GeoradarSplineClipFrame[];
  state: GeoradarFaceEditorState;
  visible: boolean;
};

const FACE_DRAG_KIND = {
  clipX: "clip-x",
  offsetRight: "offset-right",
  offsetDown: "offset-down",
  clipRange: "clip-range",
  clipYMinimum: "clip-y-minimum",
  clipYMaximum: "clip-y-maximum",
  clipZMinimum: "clip-z-minimum",
  clipZMaximum: "clip-z-maximum",
} as const;

type FaceDragKind = (typeof FACE_DRAG_KIND)[keyof typeof FACE_DRAG_KIND];

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MINIMUM_CLIP_SPAN = 0.002;
const MINIMUM_PROJECTED_FACE_AREA = 144;

const createSvgElement = <Name extends keyof SVGElementTagNameMap>(
  name: Name
) => document.createElementNS(SVG_NAMESPACE, name);

const copyRange = (range: GeoradarFaceClipRange): GeoradarFaceClipRange => ({
  min: range.min,
  max: range.max,
});

const moveRange = (
  range: GeoradarFaceClipRange,
  delta: number
): GeoradarFaceClipRange => {
  const span = range.max - range.min;
  const minimum = THREE.MathUtils.clamp(range.min + delta, 0, 1 - span);
  return { min: minimum, max: minimum + span };
};

const formatMeters = (value: number) =>
  `${value.toFixed(Math.abs(value) < 1 ? 3 : 2)} m`;

const formatSignedMeters = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)} m`;

const polygonArea = (points: readonly THREE.Vector2[]) => {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
};

const setPolygonPoints = (
  polygon: SVGPolygonElement,
  points: readonly THREE.Vector2[]
) => {
  polygon.setAttribute(
    "points",
    points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  );
};

const setPathPoints = (
  path: SVGPathElement,
  points: readonly THREE.Vector2[],
  close = false
) => {
  path.setAttribute(
    "d",
    points
      .map(
        ({ x, y }, index) =>
          `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
      )
      .join(" ") + (close ? " Z" : "")
  );
};

const setCirclePosition = (circle: SVGCircleElement, point: THREE.Vector2) => {
  circle.setAttribute("cx", point.x.toFixed(2));
  circle.setAttribute("cy", point.y.toFixed(2));
};

const midpoint = (left: THREE.Vector2, right: THREE.Vector2) =>
  new THREE.Vector2().addVectors(left, right).multiplyScalar(0.5);

const cloneFrame = (frame: GeoradarFaceFrame): GeoradarFaceFrame => ({
  ...frame,
  surfaceCenterWorld: frame.surfaceCenterWorld.clone(),
  horizontalWorld: frame.horizontalWorld.clone(),
  depthWorld: frame.depthWorld.clone(),
  normalWorld: frame.normalWorld.clone(),
});

const cloneSplineClipFrame = (
  frame: GeoradarSplineClipFrame
): GeoradarSplineClipFrame => ({
  ...frame,
  plane: cloneFrame(frame.plane),
  points: frame.points.map(({ world, acrossWorld, depthWorld, unit }) => ({
    world: world.clone(),
    acrossWorld: acrossWorld.clone(),
    depthWorld: depthWorld.clone(),
    unit,
  })),
});

export const createGeoradarFaceEditor = (
  host: HTMLElement,
  options: {
    onPreview: (edit: GeoradarFaceEditorEdit) => void;
    onCommit: (edit: GeoradarFaceEditorEdit) => void;
    requestRender: () => void;
  }
) => {
  const root = createSvgElement("svg");
  root.classList.add("capture026-georadar-face-editor");
  root.setAttribute(
    "aria-label",
    "Georadar direkt an der Schnittfläche bearbeiten"
  );
  root.setAttribute("role", "group");
  root.setAttribute("hidden", "");

  const faceLayer = createSvgElement("g");
  const splineLayer = createSvgElement("g");

  const splinePath = createSvgElement("path");
  splinePath.classList.add("capture026-georadar-spline");
  const longitudinalGuides = Array.from({ length: 4 }, () => {
    const path = createSvgElement("path");
    path.classList.add("capture026-georadar-spline-guide");
    return path;
  });
  const splineHitTarget = createSvgElement("path");
  splineHitTarget.classList.add(
    "capture026-georadar-spline-hit",
    "is-interactive"
  );
  splineHitTarget.dataset.dragKind = FACE_DRAG_KIND.clipX;
  splineHitTarget.setAttribute("role", "slider");
  splineHitTarget.setAttribute(
    "aria-label",
    "Georadar-Schnittfront entlang der Trasse ziehen"
  );
  const splineClipPlane = createSvgElement("polygon");
  splineClipPlane.classList.add(
    "capture026-georadar-spline-clip-plane",
    "is-interactive"
  );
  splineClipPlane.dataset.dragKind = FACE_DRAG_KIND.clipX;
  splineClipPlane.setAttribute("role", "slider");
  splineClipPlane.setAttribute(
    "aria-label",
    "Georadar-Schnittfront als Clip-Ebene entlang der Trasse ziehen"
  );
  const splineClipTarget = createSvgElement("circle");
  splineClipTarget.classList.add(
    "capture026-georadar-spline-target",
    "is-interactive"
  );
  splineClipTarget.dataset.dragKind = FACE_DRAG_KIND.clipX;
  splineClipTarget.setAttribute("r", "8");
  splineClipTarget.setAttribute("role", "slider");
  splineClipTarget.setAttribute(
    "aria-label",
    "Georadar-Schnittfront entlang der Trasse ziehen"
  );
  const splineXLabel = createSvgElement("text");
  splineXLabel.classList.add("capture026-georadar-face-label", "is-spline");

  const farSplineClipPlane = createSvgElement("polygon");
  farSplineClipPlane.classList.add(
    "capture026-georadar-spline-clip-plane",
    "is-secondary",
    "is-interactive"
  );
  farSplineClipPlane.dataset.dragKind = FACE_DRAG_KIND.clipX;
  farSplineClipPlane.setAttribute("role", "slider");
  farSplineClipPlane.setAttribute(
    "aria-label",
    "Gegenüberliegende Georadar-Schnittfront verschieben"
  );
  const farSplineClipTarget = createSvgElement("circle");
  farSplineClipTarget.classList.add(
    "capture026-georadar-spline-target",
    "is-secondary",
    "is-interactive"
  );
  farSplineClipTarget.dataset.dragKind = FACE_DRAG_KIND.clipX;
  farSplineClipTarget.setAttribute("r", "7");
  farSplineClipTarget.setAttribute("role", "slider");
  farSplineClipTarget.setAttribute(
    "aria-label",
    "Gegenüberliegende Georadar-Schnittfront entlang der Trasse ziehen"
  );
  const farSplineXLabel = createSvgElement("text");
  farSplineXLabel.classList.add(
    "capture026-georadar-face-label",
    "is-spline",
    "is-secondary"
  );

  const rightOffsetConnector = createSvgElement("line");
  rightOffsetConnector.classList.add("capture026-georadar-offset-connector");
  const rightOffsetTarget = createSvgElement("circle");
  rightOffsetTarget.classList.add(
    "capture026-georadar-axis-target",
    "is-right",
    "is-interactive"
  );
  rightOffsetTarget.dataset.dragKind = FACE_DRAG_KIND.offsetRight;
  rightOffsetTarget.setAttribute("r", "8");
  rightOffsetTarget.setAttribute("role", "slider");
  rightOffsetTarget.setAttribute(
    "aria-label",
    "Georadar seitlich zur Trasse verschieben"
  );
  const rightOffsetLabel = createSvgElement("text");
  rightOffsetLabel.classList.add("capture026-georadar-face-label", "is-axis");
  rightOffsetLabel.setAttribute("text-anchor", "middle");
  rightOffsetLabel.textContent = "R";

  const downOffsetConnector = createSvgElement("line");
  downOffsetConnector.classList.add("capture026-georadar-offset-connector");
  const downOffsetTarget = createSvgElement("circle");
  downOffsetTarget.classList.add(
    "capture026-georadar-axis-target",
    "is-down",
    "is-interactive"
  );
  downOffsetTarget.dataset.dragKind = FACE_DRAG_KIND.offsetDown;
  downOffsetTarget.setAttribute("r", "8");
  downOffsetTarget.setAttribute("role", "slider");
  downOffsetTarget.setAttribute("aria-label", "Georadar vertikal verschieben");
  const downOffsetLabel = createSvgElement("text");
  downOffsetLabel.classList.add("capture026-georadar-face-label", "is-axis");
  downOffsetLabel.setAttribute("text-anchor", "middle");
  downOffsetLabel.textContent = "H";

  const fullFace = createSvgElement("path");
  fullFace.classList.add("capture026-georadar-face-outline");
  const clippedFace = createSvgElement("path");
  clippedFace.classList.add(
    "capture026-georadar-face-clipped",
    "is-interactive"
  );
  clippedFace.dataset.dragKind = FACE_DRAG_KIND.clipRange;
  clippedFace.setAttribute("role", "slider");
  clippedFace.setAttribute(
    "aria-label",
    "Georadar-Ausschnitt zweidimensional verschieben"
  );

  const clipRangeConnector = createSvgElement("line");
  clipRangeConnector.classList.add("capture026-georadar-face-range-connector");
  const clipRangeTarget = createSvgElement("g");
  clipRangeTarget.classList.add(
    "capture026-georadar-face-range-target",
    "is-interactive"
  );
  clipRangeTarget.dataset.dragKind = FACE_DRAG_KIND.clipRange;
  clipRangeTarget.setAttribute("role", "button");
  clipRangeTarget.setAttribute(
    "aria-label",
    "Georadar-Clipbereich zweidimensional verschieben"
  );
  const clipRangeTargetCircle = createSvgElement("circle");
  clipRangeTargetCircle.setAttribute("r", "10");
  const clipRangeTargetHorizontal = createSvgElement("line");
  clipRangeTargetHorizontal.setAttribute("x1", "-6");
  clipRangeTargetHorizontal.setAttribute("x2", "6");
  const clipRangeTargetVertical = createSvgElement("line");
  clipRangeTargetVertical.setAttribute("y1", "-6");
  clipRangeTargetVertical.setAttribute("y2", "6");
  clipRangeTarget.append(
    clipRangeTargetCircle,
    clipRangeTargetHorizontal,
    clipRangeTargetVertical
  );
  const clipRangeLabel = createSvgElement("text");
  clipRangeLabel.classList.add("capture026-georadar-face-label", "is-range");
  clipRangeLabel.textContent = "Ausschnitt";

  const stationLabel = createSvgElement("text");
  stationLabel.classList.add("capture026-georadar-face-label", "is-station");
  stationLabel.setAttribute("text-anchor", "middle");
  const widthLabel = createSvgElement("text");
  widthLabel.classList.add("capture026-georadar-face-label", "is-dimension");
  widthLabel.setAttribute("text-anchor", "middle");
  const depthLabel = createSvgElement("text");
  depthLabel.classList.add("capture026-georadar-face-label", "is-dimension");
  depthLabel.setAttribute("dominant-baseline", "middle");

  const createHandle = (
    kind: FaceDragKind,
    label: string,
    className: string
  ) => {
    const handle = createSvgElement("circle");
    handle.classList.add(
      "capture026-georadar-face-handle",
      "is-interactive",
      className
    );
    handle.dataset.dragKind = kind;
    handle.setAttribute("r", "6");
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", label);
    return handle;
  };

  const yMinimumHandle = createHandle(
    FACE_DRAG_KIND.clipYMinimum,
    "Linke Y-Clipgrenze ziehen",
    "is-horizontal"
  );
  const yMaximumHandle = createHandle(
    FACE_DRAG_KIND.clipYMaximum,
    "Rechte Y-Clipgrenze ziehen",
    "is-horizontal"
  );
  const zMinimumHandle = createHandle(
    FACE_DRAG_KIND.clipZMinimum,
    "Obere Z-Clipgrenze ziehen",
    "is-vertical"
  );
  const zMaximumHandle = createHandle(
    FACE_DRAG_KIND.clipZMaximum,
    "Untere Z-Clipgrenze ziehen",
    "is-vertical"
  );

  faceLayer.append(
    fullFace,
    clippedFace,
    clipRangeConnector,
    clipRangeTarget,
    clipRangeLabel,
    yMinimumHandle,
    yMaximumHandle,
    zMinimumHandle,
    zMaximumHandle,
    stationLabel,
    widthLabel,
    depthLabel
  );
  splineLayer.append(
    splinePath,
    ...longitudinalGuides,
    splineHitTarget,
    farSplineClipPlane,
    splineClipPlane,
    rightOffsetConnector,
    downOffsetConnector,
    splineClipTarget,
    farSplineClipTarget,
    rightOffsetTarget,
    downOffsetTarget,
    splineXLabel,
    farSplineXLabel,
    rightOffsetLabel,
    downOffsetLabel
  );
  root.append(faceLayer, splineLayer);
  host.appendChild(root);

  let latest: GeoradarFaceEditorUpdate | null = null;
  let pendingCommit: GeoradarFaceEditorEdit | null = null;
  let drag:
    | {
        pointerId: number;
        kind: FaceDragKind;
        frame: GeoradarFaceFrame;
        splineClip?: GeoradarSplineClipFrame;
        projectedSpline?: Array<{
          point: THREE.Vector2 | null;
          unit: number;
        }>;
        startPointWorld: THREE.Vector3;
        startState: GeoradarFaceEditorState;
      }
    | undefined;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const facePlane = new THREE.Plane();
  const pointerWorld = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const cameraPoint = new THREE.Vector3();
  const projectedPoint = new THREE.Vector3();
  const dragDelta = new THREE.Vector3();
  const sceneUp = new THREE.Vector3(0, 1, 0);

  const pointOnFrame = (
    frame: GeoradarFaceFrame,
    acrossUnit: number,
    depthUnit: number,
    target: THREE.Vector3
  ) =>
    target
      .copy(frame.surfaceCenterWorld)
      .addScaledVector(
        frame.horizontalWorld,
        (acrossUnit - 0.5) * frame.horizontalDisplayMeters
      )
      .addScaledVector(frame.depthWorld, depthUnit * frame.displayDepthMeters);

  const projectPoint = (
    frame: GeoradarFaceFrame,
    camera: GeoradarFaceEditorCamera,
    acrossUnit: number,
    depthUnit: number,
    viewportWidth: number,
    viewportHeight: number
  ) => {
    pointOnFrame(frame, acrossUnit, depthUnit, worldPoint);
    cameraPoint.copy(worldPoint).applyMatrix4(camera.matrixWorldInverse);
    if (cameraPoint.z >= -camera.near) return null;
    projectedPoint.copy(worldPoint).project(camera);
    if (
      !Number.isFinite(projectedPoint.x) ||
      !Number.isFinite(projectedPoint.y)
    ) {
      return null;
    }
    return new THREE.Vector2(
      (projectedPoint.x * 0.5 + 0.5) * viewportWidth,
      (-projectedPoint.y * 0.5 + 0.5) * viewportHeight
    );
  };

  const projectWorldPoint = (
    point: THREE.Vector3,
    camera: GeoradarFaceEditorCamera,
    viewportWidth: number,
    viewportHeight: number
  ) => {
    cameraPoint.copy(point).applyMatrix4(camera.matrixWorldInverse);
    if (cameraPoint.z >= -camera.near) return null;
    projectedPoint.copy(point).project(camera);
    if (
      !Number.isFinite(projectedPoint.x) ||
      !Number.isFinite(projectedPoint.y)
    ) {
      return null;
    }
    return new THREE.Vector2(
      (projectedPoint.x * 0.5 + 0.5) * viewportWidth,
      (-projectedPoint.y * 0.5 + 0.5) * viewportHeight
    );
  };

  const clientPoint = (event: PointerEvent) => {
    const bounds = host.getBoundingClientRect();
    return new THREE.Vector2(
      event.clientX - bounds.left,
      event.clientY - bounds.top
    );
  };

  const projectSpline = (
    splineClip: GeoradarSplineClipFrame,
    camera: GeoradarFaceEditorCamera,
    viewportWidth: number,
    viewportHeight: number,
    unitMinimum = 0,
    unitMaximum = 1,
    acrossUnit = 0.5,
    depthUnit = 0
  ) => {
    const sampleAtUnit = (unit: number) => {
      const scaledIndex =
        THREE.MathUtils.clamp(unit, 0, 1) *
        Math.max(1, splineClip.points.length - 1);
      const minimumIndex = Math.floor(scaledIndex);
      const maximumIndex = Math.min(
        splineClip.points.length - 1,
        minimumIndex + 1
      );
      const fraction = scaledIndex - minimumIndex;
      const minimum = splineClip.points[minimumIndex];
      const maximum = splineClip.points[maximumIndex];
      return {
        unit,
        world: minimum.world.clone().lerp(maximum.world, fraction),
        acrossWorld: minimum.acrossWorld
          .clone()
          .lerp(maximum.acrossWorld, fraction)
          .normalize(),
        depthWorld: minimum.depthWorld
          .clone()
          .lerp(maximum.depthWorld, fraction)
          .normalize(),
      };
    };
    const minimum = THREE.MathUtils.clamp(unitMinimum, 0, 1);
    const maximum = THREE.MathUtils.clamp(unitMaximum, minimum, 1);
    const samples = [
      sampleAtUnit(minimum),
      ...splineClip.points.filter(
        ({ unit }) => unit > minimum && unit < maximum
      ),
      sampleAtUnit(maximum),
    ];
    const transverseOffset =
      THREE.MathUtils.lerp(
        splineClip.traceMinimumMeters,
        splineClip.traceMaximumMeters,
        acrossUnit
      ) - splineClip.traceCenterMeters;
    return samples.map(({ world, acrossWorld, depthWorld, unit }) => ({
      point: projectWorldPoint(
        worldPoint
          .copy(world)
          .addScaledVector(acrossWorld, transverseOffset)
          .addScaledVector(
            depthWorld,
            depthUnit * splineClip.displayDepthMeters
          ),
        camera,
        viewportWidth,
        viewportHeight
      ),
      unit,
    }));
  };

  const nearestSplineUnit = (
    event: PointerEvent,
    projectedSpline: Array<{ point: THREE.Vector2 | null; unit: number }>,
    fallbackUnit: number
  ) => {
    const pointer = clientPoint(event);
    let nearestUnit = fallbackUnit;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 1; index < projectedSpline.length; index += 1) {
      const previous = projectedSpline[index - 1];
      const current = projectedSpline[index];
      const start = previous.point;
      const end = current.point;
      if (!start || !end) continue;
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
      const fraction =
        segmentLengthSquared <= 1e-6
          ? 0
          : THREE.MathUtils.clamp(
              ((pointer.x - start.x) * segmentX +
                (pointer.y - start.y) * segmentY) /
                segmentLengthSquared,
              0,
              1
            );
      const nearestX = start.x + segmentX * fraction;
      const nearestY = start.y + segmentY * fraction;
      const distanceSquared =
        (pointer.x - nearestX) ** 2 + (pointer.y - nearestY) ** 2;
      if (distanceSquared >= nearestDistanceSquared) continue;
      nearestDistanceSquared = distanceSquared;
      nearestUnit = THREE.MathUtils.lerp(previous.unit, current.unit, fraction);
    }
    return nearestUnit;
  };

  const intersectPointerWithFrame = (
    event: PointerEvent,
    frame: GeoradarFaceFrame,
    camera: GeoradarFaceEditorCamera
  ) => {
    const bounds = host.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    facePlane.setFromNormalAndCoplanarPoint(
      frame.normalWorld,
      frame.surfaceCenterWorld
    );
    return raycaster.ray.intersectPlane(facePlane, pointerWorld);
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = (event.target as Element | null)?.closest<SVGElement>(
      "[data-drag-kind]"
    );
    const kind = target?.dataset.dragKind as FaceDragKind | undefined;
    if (!kind || !latest?.visible) return;
    const requestedBoundary = target?.dataset.clipBoundary as
      | "minimum"
      | "maximum"
      | undefined;
    const primarySplineClip = latest.splineClips[0];
    const selectedSplineClip = requestedBoundary
      ? latest.splineClips.find(
          ({ boundary }) => boundary === requestedBoundary
        )
      : primarySplineClip;
    const splineDrag =
      kind === FACE_DRAG_KIND.clipX ||
      kind === FACE_DRAG_KIND.offsetRight ||
      kind === FACE_DRAG_KIND.offsetDown;
    const frame = splineDrag
      ? selectedSplineClip?.plane
      : latest.frame ?? primarySplineClip?.plane;
    if (!frame || (splineDrag && !selectedSplineClip)) return;
    const point =
      kind === FACE_DRAG_KIND.clipX
        ? frame.surfaceCenterWorld
        : intersectPointerWithFrame(event, frame, latest.camera);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    root.setPointerCapture(event.pointerId);
    root.classList.add("is-dragging");
    const bounds = host.getBoundingClientRect();
    const splineClip = selectedSplineClip
      ? cloneSplineClipFrame(selectedSplineClip)
      : undefined;
    drag = {
      pointerId: event.pointerId,
      kind,
      frame: cloneFrame(frame),
      splineClip,
      projectedSpline: splineClip
        ? projectSpline(splineClip, latest.camera, bounds.width, bounds.height)
        : undefined,
      startPointWorld: point.clone(),
      startState: {
        clipX: copyRange(latest.state.clipX),
        clipY: copyRange(latest.state.clipY),
        clipZ: copyRange(latest.state.clipZ),
        offsetForwardMeters: latest.state.offsetForwardMeters,
        offsetRightMeters: latest.state.offsetRightMeters,
        offsetDownMeters: latest.state.offsetDownMeters,
      },
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId || !latest) return;
    // A pointerup that never reaches this element — released outside the
    // window, or after the pointer capture was lost — would otherwise leave
    // the drag engaged and the slice would keep following the cursor. No
    // button still held means the gesture is over.
    if (event.buttons === 0) {
      endDrag(event);
      return;
    }
    const coalescedEvents = event.getCoalescedEvents?.() ?? [];
    const currentEvent = coalescedEvents.at(-1) ?? event;
    if (
      drag.kind === FACE_DRAG_KIND.clipX &&
      drag.splineClip &&
      drag.projectedSpline
    ) {
      event.preventDefault();
      const clipX = copyRange(drag.startState.clipX);
      const unit = nearestSplineUnit(
        currentEvent,
        drag.projectedSpline,
        drag.splineClip.unit
      );
      if (drag.splineClip.boundary === "minimum") {
        clipX.min = THREE.MathUtils.clamp(
          unit,
          0,
          clipX.max - MINIMUM_CLIP_SPAN
        );
      } else {
        clipX.max = THREE.MathUtils.clamp(
          unit,
          clipX.min + MINIMUM_CLIP_SPAN,
          1
        );
      }
      pendingCommit = {
        kind: "clipping",
        clipX,
        clipY: copyRange(drag.startState.clipY),
        clipZ: copyRange(drag.startState.clipZ),
      };
      options.onPreview(pendingCommit);
      options.requestRender();
      return;
    }
    const point = intersectPointerWithFrame(
      currentEvent,
      drag.frame,
      latest.camera
    );
    if (!point) return;
    event.preventDefault();
    dragDelta.subVectors(point, drag.startPointWorld);
    const horizontalDeltaMeters = dragDelta.dot(drag.frame.horizontalWorld);
    const horizontalDeltaUnit =
      (horizontalDeltaMeters /
        Math.max(1e-6, drag.frame.horizontalDisplayMeters)) *
      (drag.frame.horizontalUnitMaximum - drag.frame.horizontalUnitMinimum);
    const depthDeltaUnit =
      dragDelta.dot(drag.frame.depthWorld) /
      Math.max(1e-6, drag.frame.displayDepthMeters);

    if (
      drag.kind === FACE_DRAG_KIND.offsetRight ||
      drag.kind === FACE_DRAG_KIND.offsetDown
    ) {
      pendingCommit = {
        kind: "offset",
        offsetForwardMeters: drag.startState.offsetForwardMeters,
        offsetRightMeters:
          drag.startState.offsetRightMeters +
          (drag.kind === FACE_DRAG_KIND.offsetRight
            ? horizontalDeltaMeters
            : 0),
        offsetDownMeters:
          drag.startState.offsetDownMeters -
          (drag.kind === FACE_DRAG_KIND.offsetDown
            ? dragDelta.dot(sceneUp)
            : 0),
      };
    } else if (drag.kind === FACE_DRAG_KIND.clipRange) {
      const horizontalClip =
        drag.frame.horizontalAxis === "x"
          ? drag.startState.clipX
          : drag.startState.clipY;
      const movedHorizontalClip = moveRange(
        horizontalClip,
        horizontalDeltaUnit
      );
      pendingCommit = {
        kind: "clipping",
        clipX:
          drag.frame.horizontalAxis === "x"
            ? movedHorizontalClip
            : copyRange(drag.startState.clipX),
        clipY:
          drag.frame.horizontalAxis === "y"
            ? movedHorizontalClip
            : copyRange(drag.startState.clipY),
        clipZ: moveRange(drag.startState.clipZ, depthDeltaUnit),
      };
    } else {
      const clipX = copyRange(drag.startState.clipX);
      const clipY = copyRange(drag.startState.clipY);
      const clipZ = copyRange(drag.startState.clipZ);
      const horizontalClip = drag.frame.horizontalAxis === "x" ? clipX : clipY;
      if (drag.kind === FACE_DRAG_KIND.clipYMinimum) {
        const displayedMinimum = Math.max(
          horizontalClip.min,
          drag.frame.horizontalUnitMinimum
        );
        horizontalClip.min = THREE.MathUtils.clamp(
          displayedMinimum + horizontalDeltaUnit,
          0,
          horizontalClip.max - MINIMUM_CLIP_SPAN
        );
      } else if (drag.kind === FACE_DRAG_KIND.clipYMaximum) {
        const displayedMaximum = Math.min(
          horizontalClip.max,
          drag.frame.horizontalUnitMaximum
        );
        horizontalClip.max = THREE.MathUtils.clamp(
          displayedMaximum + horizontalDeltaUnit,
          horizontalClip.min + MINIMUM_CLIP_SPAN,
          1
        );
      } else if (drag.kind === FACE_DRAG_KIND.clipZMinimum) {
        clipZ.min = THREE.MathUtils.clamp(
          drag.startState.clipZ.min + depthDeltaUnit,
          0,
          clipZ.max - MINIMUM_CLIP_SPAN
        );
      } else if (drag.kind === FACE_DRAG_KIND.clipZMaximum) {
        clipZ.max = THREE.MathUtils.clamp(
          drag.startState.clipZ.max + depthDeltaUnit,
          clipZ.min + MINIMUM_CLIP_SPAN,
          1
        );
      }
      pendingCommit = { kind: "clipping", clipX, clipY, clipZ };
    }
    options.onPreview(pendingCommit);
    options.requestRender();
  };

  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (root.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }
    if (pendingCommit) options.onCommit(pendingCommit);
    pendingCommit = null;
    drag = undefined;
    root.classList.remove("is-dragging");
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  const update = (next: GeoradarFaceEditorUpdate) => {
    latest = next;
    const { camera, state, visible } = next;
    const splineClip = next.splineClips[0] ?? null;
    const frame = next.frame ?? splineClip?.plane ?? null;
    if (!visible || !frame) {
      root.setAttribute("hidden", "");
      return;
    }
    const viewportWidth = Math.max(1, host.clientWidth);
    const viewportHeight = Math.max(1, host.clientHeight);
    root.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);

    const fullPoints = [
      projectPoint(frame, camera, 0, 0, viewportWidth, viewportHeight),
      projectPoint(frame, camera, 1, 0, viewportWidth, viewportHeight),
      projectPoint(frame, camera, 1, 1, viewportWidth, viewportHeight),
      projectPoint(frame, camera, 0, 1, viewportWidth, viewportHeight),
    ];
    if (
      fullPoints.some((point) => point === null) ||
      polygonArea(fullPoints as THREE.Vector2[]) < MINIMUM_PROJECTED_FACE_AREA
    ) {
      root.setAttribute("hidden", "");
      return;
    }

    const horizontalClip =
      frame.horizontalAxis === "x" ? state.clipX : state.clipY;
    const horizontalUnitSpan = Math.max(
      1e-6,
      frame.horizontalUnitMaximum - frame.horizontalUnitMinimum
    );
    const toFaceUnit = (unit: number) =>
      THREE.MathUtils.clamp(
        (unit - frame.horizontalUnitMinimum) / horizontalUnitSpan,
        0,
        1
      );
    const clipMinimumOnFace = toFaceUnit(horizontalClip.min);
    const clipMaximumOnFace = toFaceUnit(horizontalClip.max);
    if (clipMaximumOnFace <= clipMinimumOnFace) {
      root.setAttribute("hidden", "");
      return;
    }
    const clipPoints = [
      projectPoint(
        frame,
        camera,
        clipMinimumOnFace,
        state.clipZ.min,
        viewportWidth,
        viewportHeight
      ),
      projectPoint(
        frame,
        camera,
        clipMaximumOnFace,
        state.clipZ.min,
        viewportWidth,
        viewportHeight
      ),
      projectPoint(
        frame,
        camera,
        clipMaximumOnFace,
        state.clipZ.max,
        viewportWidth,
        viewportHeight
      ),
      projectPoint(
        frame,
        camera,
        clipMinimumOnFace,
        state.clipZ.max,
        viewportWidth,
        viewportHeight
      ),
    ];
    if (clipPoints.some((point) => point === null)) {
      root.setAttribute("hidden", "");
      return;
    }

    let full = fullPoints as THREE.Vector2[];
    let clipped = clipPoints as THREE.Vector2[];
    let fullFacePath = full;
    let clippedFacePath = clipped;
    if (frame.horizontalAxis === "x" && splineClip) {
      const transverseUnit = frame.transverseUnit ?? 0.5;
      const projectFaceEdge = (
        unitMinimum: number,
        unitMaximum: number,
        depthUnit: number
      ) => {
        const projected = projectSpline(
          splineClip,
          camera,
          viewportWidth,
          viewportHeight,
          unitMinimum,
          unitMaximum,
          transverseUnit,
          depthUnit
        ).map(({ point }) => point);
        return projected.every(
          (point): point is THREE.Vector2 => point !== null
        )
          ? projected
          : null;
      };
      const fullTop = projectFaceEdge(
        frame.horizontalUnitMinimum,
        frame.horizontalUnitMaximum,
        0
      );
      const fullBottom = projectFaceEdge(
        frame.horizontalUnitMinimum,
        frame.horizontalUnitMaximum,
        1
      );
      const clippedUnitMinimum = Math.max(
        horizontalClip.min,
        frame.horizontalUnitMinimum
      );
      const clippedUnitMaximum = Math.min(
        horizontalClip.max,
        frame.horizontalUnitMaximum
      );
      const clippedTop = projectFaceEdge(
        clippedUnitMinimum,
        clippedUnitMaximum,
        state.clipZ.min
      );
      const clippedBottom = projectFaceEdge(
        clippedUnitMinimum,
        clippedUnitMaximum,
        state.clipZ.max
      );
      if (fullTop && fullBottom && clippedTop && clippedBottom) {
        full = [fullTop[0], fullTop.at(-1)!, fullBottom.at(-1)!, fullBottom[0]];
        clipped = [
          clippedTop[0],
          clippedTop.at(-1)!,
          clippedBottom.at(-1)!,
          clippedBottom[0],
        ];
        fullFacePath = [...fullTop, ...[...fullBottom].reverse()];
        clippedFacePath = [...clippedTop, ...[...clippedBottom].reverse()];
      }
    }
    root.removeAttribute("hidden");
    setPathPoints(fullFace, fullFacePath, true);
    setPathPoints(clippedFace, clippedFacePath, true);
    setCirclePosition(yMinimumHandle, midpoint(clipped[0], clipped[3]));
    setCirclePosition(yMaximumHandle, midpoint(clipped[1], clipped[2]));
    yMinimumHandle.setAttribute("visibility", "visible");
    yMaximumHandle.setAttribute("visibility", "visible");
    yMinimumHandle.setAttribute(
      "aria-label",
      `${frame.horizontalAxis.toUpperCase()}-Clipminimum ziehen`
    );
    yMaximumHandle.setAttribute(
      "aria-label",
      `${frame.horizontalAxis.toUpperCase()}-Clipmaximum ziehen`
    );
    setCirclePosition(zMinimumHandle, midpoint(clipped[0], clipped[1]));
    setCirclePosition(zMaximumHandle, midpoint(clipped[3], clipped[2]));
    const clipRangeAnchor = midpoint(clipped[0], clipped[1]);
    const clipRangeTargetPosition = new THREE.Vector2(
      clipRangeAnchor.x,
      Math.max(14, clipRangeAnchor.y - 30)
    );
    clipRangeConnector.setAttribute("x1", clipRangeAnchor.x.toFixed(2));
    clipRangeConnector.setAttribute("y1", clipRangeAnchor.y.toFixed(2));
    clipRangeConnector.setAttribute("x2", clipRangeTargetPosition.x.toFixed(2));
    clipRangeConnector.setAttribute(
      "y2",
      (clipRangeTargetPosition.y + 10).toFixed(2)
    );
    clipRangeTarget.setAttribute(
      "transform",
      `translate(${clipRangeTargetPosition.x.toFixed(
        2
      )} ${clipRangeTargetPosition.y.toFixed(2)})`
    );
    clipRangeLabel.setAttribute(
      "x",
      (clipRangeTargetPosition.x + 15).toFixed(2)
    );
    clipRangeLabel.setAttribute(
      "y",
      (clipRangeTargetPosition.y + 4).toFixed(2)
    );
    const widthPosition = midpoint(clipped[0], clipped[1]);
    widthLabel.setAttribute("x", widthPosition.x.toFixed(2));
    widthLabel.setAttribute("y", (widthPosition.y - 11).toFixed(2));
    widthLabel.textContent = `${frame.horizontalAxis.toUpperCase()} ${formatMeters(
      (horizontalClip.max - horizontalClip.min) * frame.horizontalSourceMeters
    )}`;
    widthLabel.setAttribute(
      "visibility",
      frame.horizontalAxis === "x" ? "visible" : "hidden"
    );
    const depthPosition = midpoint(clipped[1], clipped[2]);
    depthLabel.setAttribute("x", (depthPosition.x + 12).toFixed(2));
    depthLabel.setAttribute("y", depthPosition.y.toFixed(2));
    const displayScale =
      frame.sourceDepthMeters > 0
        ? frame.displayDepthMeters / frame.sourceDepthMeters
        : 1;
    depthLabel.textContent = `Z ${formatMeters(
      (state.clipZ.max - state.clipZ.min) * frame.sourceDepthMeters
    )}${displayScale > 1.01 ? ` · ${displayScale.toFixed(0)}×` : ""}`;
    depthLabel.setAttribute(
      "visibility",
      frame.horizontalAxis === "x" ? "visible" : "hidden"
    );
    const stationPosition = midpoint(full[0], full[1]);
    stationLabel.setAttribute("x", stationPosition.x.toFixed(2));
    stationLabel.setAttribute(
      "y",
      Math.max(12, stationPosition.y - 50).toFixed(2)
    );
    stationLabel.textContent = frame.label;
    stationLabel.setAttribute(
      "visibility",
      frame.horizontalAxis === "x" ? "visible" : "hidden"
    );

    if (!splineClip) {
      splineLayer.setAttribute("visibility", "hidden");
      return;
    }
    splineLayer.removeAttribute("visibility");
    const projectedSpline = projectSpline(
      splineClip,
      camera,
      viewportWidth,
      viewportHeight
    );
    const pathFromProjection = (
      projection: Array<{ point: THREE.Vector2 | null }>
    ) => {
      let path = "";
      let previousVisible = false;
      for (const { point } of projection) {
        if (!point) {
          previousVisible = false;
          continue;
        }
        path += `${previousVisible ? " L" : "M"}${point.x.toFixed(
          2
        )},${point.y.toFixed(2)}`;
        previousVisible = true;
      }
      return path;
    };
    const path = pathFromProjection(projectedSpline);
    splinePath.setAttribute("d", path);
    splineHitTarget.setAttribute("d", path);
    const longitudinalGuideAxes = [
      [state.clipY.min, state.clipZ.min],
      [state.clipY.max, state.clipZ.min],
      [state.clipY.max, state.clipZ.max],
      [state.clipY.min, state.clipZ.max],
    ] as const;
    longitudinalGuides.forEach((guide, index) => {
      const [acrossUnit, depthUnit] = longitudinalGuideAxes[index];
      guide.setAttribute(
        "d",
        pathFromProjection(
          projectSpline(
            splineClip,
            camera,
            viewportWidth,
            viewportHeight,
            state.clipX.min,
            state.clipX.max,
            acrossUnit,
            depthUnit
          )
        )
      );
    });

    const renderBoundary = (
      clip: GeoradarSplineClipFrame,
      planeElement: SVGPolygonElement,
      targetElement: SVGCircleElement,
      labelElement: SVGTextElement
    ) => {
      const plane = clip.plane;
      const points = [
        projectPoint(
          plane,
          camera,
          state.clipY.min,
          state.clipZ.min,
          viewportWidth,
          viewportHeight
        ),
        projectPoint(
          plane,
          camera,
          state.clipY.max,
          state.clipZ.min,
          viewportWidth,
          viewportHeight
        ),
        projectPoint(
          plane,
          camera,
          state.clipY.max,
          state.clipZ.max,
          viewportWidth,
          viewportHeight
        ),
        projectPoint(
          plane,
          camera,
          state.clipY.min,
          state.clipZ.max,
          viewportWidth,
          viewportHeight
        ),
      ];
      const center = projectPoint(
        plane,
        camera,
        0.5,
        0,
        viewportWidth,
        viewportHeight
      );
      const rendered = points.every(
        (point): point is THREE.Vector2 => point !== null
      );
      const onScreen =
        rendered &&
        center !== null &&
        center.x >= 0 &&
        center.x <= viewportWidth &&
        center.y >= 0 &&
        center.y <= viewportHeight;
      planeElement.dataset.clipBoundary = clip.boundary;
      targetElement.dataset.clipBoundary = clip.boundary;
      planeElement.setAttribute("visibility", onScreen ? "visible" : "hidden");
      targetElement.setAttribute("visibility", "visible");
      labelElement.setAttribute("visibility", "visible");
      targetElement.classList.toggle("is-offscreen", !onScreen);
      labelElement.classList.toggle("is-offscreen", !onScreen);
      if (!onScreen || !rendered || !center) {
        const fallback = new THREE.Vector2(
          clip.boundary === "minimum" ? 24 : viewportWidth - 24,
          viewportHeight * 0.5
        );
        setCirclePosition(targetElement, fallback);
        labelElement.setAttribute(
          "x",
          (fallback.x + (clip.boundary === "minimum" ? 14 : -14)).toFixed(2)
        );
        labelElement.setAttribute("y", (fallback.y + 4).toFixed(2));
        labelElement.setAttribute(
          "text-anchor",
          clip.boundary === "minimum" ? "start" : "end"
        );
        labelElement.textContent = `X ${
          clip.boundary === "minimum" ? "min" : "max"
        } ${formatMeters(clip.stationMeters)} · außerhalb`;
        return null;
      }
      setPolygonPoints(planeElement, points);
      setCirclePosition(targetElement, center);
      labelElement.setAttribute("text-anchor", "start");
      labelElement.setAttribute("x", (center.x + 12).toFixed(2));
      labelElement.setAttribute("y", (center.y + 18).toFixed(2));
      labelElement.textContent = `X ${
        clip.boundary === "minimum" ? "min" : "max"
      } ${formatMeters(clip.stationMeters)}`;
      return center;
    };

    const activePoint = renderBoundary(
      splineClip,
      splineClipPlane,
      splineClipTarget,
      splineXLabel
    );
    const farSplineClip = next.splineClips[1];
    if (farSplineClip) {
      renderBoundary(
        farSplineClip,
        farSplineClipPlane,
        farSplineClipTarget,
        farSplineXLabel
      );
    } else {
      farSplineClipPlane.setAttribute("visibility", "hidden");
      farSplineClipTarget.setAttribute("visibility", "hidden");
      farSplineXLabel.setAttribute("visibility", "hidden");
    }
    if (!activePoint) return;

    const plane = splineClip.plane;

    const rightAxisPoint = projectWorldPoint(
      worldPoint.copy(plane.surfaceCenterWorld).add(plane.horizontalWorld),
      camera,
      viewportWidth,
      viewportHeight
    );
    const upAxisPoint = projectWorldPoint(
      worldPoint.copy(plane.surfaceCenterWorld).add(sceneUp),
      camera,
      viewportWidth,
      viewportHeight
    );
    const rightAxisDirection = rightAxisPoint
      ? rightAxisPoint.clone().sub(activePoint).normalize()
      : new THREE.Vector2(-1, 0);
    if (rightAxisDirection.x > 0) rightAxisDirection.multiplyScalar(-1);
    const upAxisDirection = upAxisPoint
      ? upAxisPoint.clone().sub(activePoint).normalize()
      : new THREE.Vector2(0, -1);
    if (upAxisDirection.y > 0) upAxisDirection.multiplyScalar(-1);
    const rightTarget = rightAxisDirection.multiplyScalar(48).add(activePoint);
    const downTarget = upAxisDirection.multiplyScalar(48).add(activePoint);
    rightTarget.set(
      THREE.MathUtils.clamp(rightTarget.x, 14, viewportWidth - 14),
      THREE.MathUtils.clamp(rightTarget.y, 14, viewportHeight - 14)
    );
    downTarget.set(
      THREE.MathUtils.clamp(downTarget.x, 14, viewportWidth - 14),
      THREE.MathUtils.clamp(downTarget.y, 14, viewportHeight - 14)
    );
    setCirclePosition(rightOffsetTarget, rightTarget);
    setCirclePosition(downOffsetTarget, downTarget);
    for (const [connector, target] of [
      [rightOffsetConnector, rightTarget],
      [downOffsetConnector, downTarget],
    ] as const) {
      connector.setAttribute("x1", activePoint.x.toFixed(2));
      connector.setAttribute("y1", activePoint.y.toFixed(2));
      connector.setAttribute("x2", target.x.toFixed(2));
      connector.setAttribute("y2", target.y.toFixed(2));
    }
    rightOffsetLabel.setAttribute("x", rightTarget.x.toFixed(2));
    rightOffsetLabel.setAttribute("y", (rightTarget.y + 22).toFixed(2));
    rightOffsetLabel.textContent = `R ${formatSignedMeters(
      state.offsetRightMeters
    )}`;
    downOffsetLabel.setAttribute("x", (downTarget.x + 14).toFixed(2));
    downOffsetLabel.setAttribute("y", (downTarget.y + 4).toFixed(2));
    downOffsetLabel.textContent = `H ${formatSignedMeters(
      -state.offsetDownMeters
    )}`;
  };

  return {
    update,
    dispose: () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endDrag);
      root.removeEventListener("pointercancel", endDrag);
      root.remove();
    },
  };
};
