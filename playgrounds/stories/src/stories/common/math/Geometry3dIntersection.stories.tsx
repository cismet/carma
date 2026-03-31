import {
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { Plane, Quaternion, Ray, Vector3 } from "three";

import { createPerspectiveViewClipPlanes3 } from "@carma-commons/camera/model";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS } from "@carma-mapping/engines/three/primitives";
import {
  buildCirclePoints,
  clipConvexPolygonByPlanes3d,
  intersectRayWithPlane,
} from "@carma/math";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToTwoPi,
} from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
type PerspectiveClipPlanesStoryArgs = {
  targetShape: "circle" | "square";
  fovVerticalDeg: number;
  fovHorizontalDeg: number;
  rollDeg: number;
  nearUnit: number;
  farUnit: number;
  circleSegments: number;
  showVertices: boolean;
};

const HEMISPHERE_RADIUS =
  VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS.hemisphere.radius;
const DEFAULT_CIRCLE_SEGMENTS = 128;
const DEFAULT_BEARING_DEG = 214;
const DEFAULT_PITCH_DEG = 42;
const GROUND_PLANE = new Plane().setFromNormalAndCoplanarPoint(
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 0)
);
const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, -1);
const LOCAL_ROLL_AXIS = new Vector3(0, 0, 1);
const SVG_VIEWBOX_SIZE = 760;
const SVG_PADDING = 56;
const SVG_HALF_SIZE = SVG_VIEWBOX_SIZE * 0.5;
const SVG_DRAW_RADIUS = SVG_HALF_SIZE - SVG_PADDING;
const HANDLE_RADIUS = 10;

const PAGE_STYLE: CSSProperties = {
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "#f8fafc",
};

const STATUS_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const CANVAS_WRAP_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
};

const SVG_STYLE: CSSProperties = {
  width: "min(92vw, 92vh)",
  height: "min(92vw, 92vh)",
  maxWidth: SVG_VIEWBOX_SIZE,
  maxHeight: SVG_VIEWBOX_SIZE,
  touchAction: "none",
  userSelect: "none",
  background: "#ffffff",
  boxShadow: "0 22px 60px rgba(15, 23, 42, 0.14)",
};

const buildSquarePoints = (radius: number) => {
  const halfExtent = radius / Math.SQRT2;

  return [
    { x: -halfExtent, y: -halfExtent },
    { x: halfExtent, y: -halfExtent },
    { x: halfExtent, y: halfExtent },
    { x: -halfExtent, y: halfExtent },
  ] as const;
};

const normalizeBearing = (bearingRadians: number): number =>
  zeroToTwoPi(bearingRadians as Radians) as number;

const pointOnBearingCircle = ({
  bearing,
  radius,
  y,
}: {
  bearing: number;
  radius: number;
  y: number;
}): Vector3 =>
  new Vector3(Math.sin(bearing) * radius, y, -Math.cos(bearing) * radius);

const viewingBearingPitchToCameraSpherePosition = ({
  bearingRad,
  pitchRad,
}: {
  bearingRad: number;
  pitchRad: number;
}): Vector3 => {
  const cameraSphereAzimuth = normalizeBearing(bearingRad + Math.PI);

  return pointOnBearingCircle({
    bearing: cameraSphereAzimuth,
    radius: Math.sin(pitchRad) * HEMISPHERE_RADIUS,
    y: Math.cos(pitchRad) * HEMISPHERE_RADIUS,
  });
};

const viewingBearingPitchToCameraTopViewPoint = ({
  bearingRad,
  pitchRad,
}: {
  bearingRad: number;
  pitchRad: number;
}) => {
  const cameraSphereAzimuth = normalizeBearing(bearingRad + Math.PI);
  const radialDistance = Math.sin(pitchRad) * HEMISPHERE_RADIUS;

  return {
    x: Math.sin(cameraSphereAzimuth) * radialDistance,
    y: -Math.cos(cameraSphereAzimuth) * radialDistance,
  };
};

const buildAnchoredOrientationQuaternion = ({
  bearingRad,
  pitchRad,
  rollRad,
}: {
  bearingRad: number;
  pitchRad: number;
  rollRad: number;
}) => {
  const cesiumPitch = pitchRad - Math.PI * 0.5;
  const orientation = new Quaternion()
    .setFromAxisAngle(LOCAL_UP, -bearingRad)
    .multiply(new Quaternion().setFromAxisAngle(LOCAL_RIGHT, cesiumPitch));

  if (Math.abs(rollRad) > 1e-8) {
    orientation.multiply(
      new Quaternion().setFromAxisAngle(LOCAL_ROLL_AXIS, rollRad)
    );
  }

  return orientation;
};

const buildPerspectiveCameraBasis = ({
  bearingRad,
  pitchRad,
  rollRad,
}: {
  bearingRad: number;
  pitchRad: number;
  rollRad: number;
}) => {
  const orientation = buildAnchoredOrientationQuaternion({
    bearingRad,
    pitchRad,
    rollRad,
  });

  return {
    forward: LOCAL_FORWARD.clone().applyQuaternion(orientation).normalize(),
    up: LOCAL_UP.clone().applyQuaternion(orientation).normalize(),
  };
};

const mapPlanePointToSvg = ({ x, y }: { x: number; y: number }) => ({
  x: SVG_HALF_SIZE + x * SVG_DRAW_RADIUS,
  y: SVG_HALF_SIZE - y * SVG_DRAW_RADIUS,
});

const mapSvgPointToPlane = ({
  clientX,
  clientY,
  element,
}: {
  clientX: number;
  clientY: number;
  element: Element;
}) => {
  const bounds = element.getBoundingClientRect();
  const normalizedX = (clientX - bounds.left) / bounds.width;
  const normalizedY = (clientY - bounds.top) / bounds.height;

  return {
    x: (normalizedX * SVG_VIEWBOX_SIZE - SVG_HALF_SIZE) / SVG_DRAW_RADIUS,
    y: -((normalizedY * SVG_VIEWBOX_SIZE - SVG_HALF_SIZE) / SVG_DRAW_RADIUS),
  };
};

const clampPointToDisk = ({ x, y }: { x: number; y: number }) => {
  const radius = Math.hypot(x, y);
  if (radius <= HEMISPHERE_RADIUS || radius === 0) {
    return { x, y };
  }

  const scale = HEMISPHERE_RADIUS / radius;
  return {
    x: x * scale,
    y: y * scale,
  };
};

const cameraTopViewPointToPose = ({ x, y }: { x: number; y: number }) => {
  const clampedPoint = clampPointToDisk({ x, y });
  const radialDistance = Math.min(
    HEMISPHERE_RADIUS,
    Math.hypot(clampedPoint.x, clampedPoint.y)
  );
  const cameraSphereAzimuth = Math.atan2(clampedPoint.x, -clampedPoint.y);

  return {
    bearingRad: normalizeBearing(cameraSphereAzimuth - Math.PI),
    pitchRad: Math.asin(Math.min(1, radialDistance / HEMISPHERE_RADIUS)),
  };
};

const buildSvgClosedPath = (
  points: readonly {
    x: number;
    y: number;
  }[]
): string =>
  points.length === 0
    ? ""
    : points
        .map((point, index) => {
          const mapped = mapPlanePointToSvg(point);
          return `${index === 0 ? "M" : "L"} ${mapped.x} ${mapped.y}`;
        })
        .join(" ") + " Z";

const polygonArea2d = (points: readonly { x: number; y: number }[]): number => {
  if (points.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    areaTwice += current.x * next.y - next.x * current.y;
  }

  return Math.abs(areaTwice) * 0.5;
};

const readOptionalClipDistance = (distance: number): number | undefined =>
  Number.isFinite(distance) && distance > 0 ? distance : undefined;

const PerspectiveClipPlanesPreview = (args: PerspectiveClipPlanesStoryArgs) => {
  const [bearingRad, setBearingRad] = useState(
    degToRadNumeric(DEFAULT_BEARING_DEG)
  );
  const [pitchRad, setPitchRad] = useState(degToRadNumeric(DEFAULT_PITCH_DEG));
  const [isDragging, setIsDragging] = useState(false);

  const {
    targetPolygon2d,
    clippedPolygon2d,
    cameraTopViewPoint,
    cameraGroundPoint2d,
    principalRayHit2d,
    nearRayPoint2d,
    farRayPoint2d,
  } = useMemo(() => {
    const { forward, up } = buildPerspectiveCameraBasis({
      bearingRad,
      pitchRad,
      rollRad: degToRadNumeric(args.rollDeg),
    });
    const cameraPosition = viewingBearingPitchToCameraSpherePosition({
      bearingRad,
      pitchRad,
    });
    const targetPolygon2d =
      args.targetShape === "square"
        ? buildSquarePoints(HEMISPHERE_RADIUS)
        : buildCirclePoints(
            HEMISPHERE_RADIUS,
            Math.max(8, Math.floor(args.circleSegments))
          );
    const clippedPolygon2d = clipConvexPolygonByPlanes3d(
      targetPolygon2d.map((point) => new Vector3(point.x, 0, point.y)),
      createPerspectiveViewClipPlanes3({
        apex: cameraPosition,
        forward,
        up,
        fovVerticalRad: degToRadNumeric(args.fovVerticalDeg),
        fovHorizontalRad: degToRadNumeric(args.fovHorizontalDeg),
        near: readOptionalClipDistance(args.nearUnit),
        far: readOptionalClipDistance(args.farUnit),
      })
    ).map((point) => ({
      x: point.x,
      y: point.z,
    }));
    const principalRayHit = intersectRayWithPlane(
      new Ray(cameraPosition, forward.clone().normalize()),
      GROUND_PLANE
    );
    const forwardDistance =
      principalRayHit
        ?.clone()
        .sub(cameraPosition)
        .dot(forward.clone().normalize()) ?? -1;

    return {
      targetPolygon2d,
      clippedPolygon2d,
      cameraTopViewPoint: viewingBearingPitchToCameraTopViewPoint({
        bearingRad,
        pitchRad,
      }),
      cameraGroundPoint2d: {
        x: cameraPosition.x,
        y: cameraPosition.z,
      },
      principalRayHit2d:
        principalRayHit && forwardDistance >= 0
          ? {
              x: principalRayHit.x,
              y: principalRayHit.z,
            }
          : null,
      nearRayPoint2d: readOptionalClipDistance(args.nearUnit)
        ? {
            x:
              cameraPosition.x +
              forward.x * readOptionalClipDistance(args.nearUnit)!,
            y:
              cameraPosition.z +
              forward.z * readOptionalClipDistance(args.nearUnit)!,
          }
        : null,
      farRayPoint2d: readOptionalClipDistance(args.farUnit)
        ? {
            x:
              cameraPosition.x +
              forward.x * readOptionalClipDistance(args.farUnit)!,
            y:
              cameraPosition.z +
              forward.z * readOptionalClipDistance(args.farUnit)!,
          }
        : null,
    };
  }, [
    args.targetShape,
    args.circleSegments,
    args.farUnit,
    args.fovHorizontalDeg,
    args.fovVerticalDeg,
    args.nearUnit,
    args.rollDeg,
    bearingRad,
    pitchRad,
  ]);

  const status = [
    args.targetShape,
    `b ${radToDegNumeric(bearingRad).toFixed(1)}°`,
    `p ${radToDegNumeric(pitchRad).toFixed(1)}°`,
    `roll ${args.rollDeg.toFixed(1)}°`,
    `fov ${args.fovVerticalDeg.toFixed(1)}° / ${args.fovHorizontalDeg.toFixed(
      1
    )}°`,
    args.nearUnit > 0 ? `near ${args.nearUnit.toFixed(2)}u` : "near off",
    args.farUnit > 0 ? `far ${args.farUnit.toFixed(2)}u` : "far off",
    `${clippedPolygon2d.length} verts`,
    `area ${polygonArea2d(clippedPolygon2d).toFixed(3)} u²`,
  ].join(" • ");

  const updatePoseFromPointer = (
    event: ReactPointerEvent<SVGSVGElement | SVGCircleElement>
  ) => {
    const svgElement =
      event.currentTarget.ownerSVGElement ?? event.currentTarget;
    const planePoint = mapSvgPointToPlane({
      clientX: event.clientX,
      clientY: event.clientY,
      element: svgElement,
    });
    const nextPose = cameraTopViewPointToPose(planePoint);

    setBearingRad(nextPose.bearingRad);
    setPitchRad(nextPose.pitchRad);
  };

  return (
    <div style={PAGE_STYLE}>
      <div style={STATUS_STYLE}>
        <ResponsiveStatusBar text={status} tone="dark" />
      </div>
      <div style={CANVAS_WRAP_STYLE}>
        <svg
          viewBox={`0 0 ${SVG_VIEWBOX_SIZE} ${SVG_VIEWBOX_SIZE}`}
          style={SVG_STYLE}
          onPointerMove={(event) => {
            if (!isDragging) return;
            updatePoseFromPointer(event);
          }}
          onPointerUp={() => {
            setIsDragging(false);
          }}
          onPointerLeave={() => {
            setIsDragging(false);
          }}
        >
          <rect
            x={0}
            y={0}
            width={SVG_VIEWBOX_SIZE}
            height={SVG_VIEWBOX_SIZE}
            fill="#ffffff"
          />
          <circle
            cx={SVG_HALF_SIZE}
            cy={SVG_HALF_SIZE}
            r={SVG_DRAW_RADIUS}
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <path
            d={buildSvgClosedPath(targetPolygon2d)}
            fill="rgba(148, 163, 184, 0.12)"
            stroke="#64748b"
            strokeWidth={2}
          />
          {clippedPolygon2d.length >= 3 ? (
            <path
              d={buildSvgClosedPath(clippedPolygon2d)}
              fill="rgba(14, 165, 233, 0.26)"
              stroke="#0284c7"
              strokeWidth={3}
            />
          ) : null}
          <line
            x1={mapPlanePointToSvg(cameraTopViewPoint).x}
            y1={mapPlanePointToSvg(cameraTopViewPoint).y}
            x2={mapPlanePointToSvg(cameraGroundPoint2d).x}
            y2={mapPlanePointToSvg(cameraGroundPoint2d).y}
            stroke="#94a3b8"
            strokeDasharray="8 6"
            strokeWidth={2}
          />
          {principalRayHit2d ? (
            <line
              x1={mapPlanePointToSvg(cameraGroundPoint2d).x}
              y1={mapPlanePointToSvg(cameraGroundPoint2d).y}
              x2={mapPlanePointToSvg(principalRayHit2d).x}
              y2={mapPlanePointToSvg(principalRayHit2d).y}
              stroke="#0f172a"
              strokeWidth={2}
            />
          ) : null}
          {nearRayPoint2d ? (
            <circle
              cx={mapPlanePointToSvg(nearRayPoint2d).x}
              cy={mapPlanePointToSvg(nearRayPoint2d).y}
              r={5}
              fill="#16a34a"
            />
          ) : null}
          {farRayPoint2d ? (
            <circle
              cx={mapPlanePointToSvg(farRayPoint2d).x}
              cy={mapPlanePointToSvg(farRayPoint2d).y}
              r={5}
              fill="#7c3aed"
            />
          ) : null}
          {principalRayHit2d ? (
            <circle
              cx={mapPlanePointToSvg(principalRayHit2d).x}
              cy={mapPlanePointToSvg(principalRayHit2d).y}
              r={5}
              fill="#0f172a"
            />
          ) : null}
          <circle
            cx={mapPlanePointToSvg(cameraGroundPoint2d).x}
            cy={mapPlanePointToSvg(cameraGroundPoint2d).y}
            r={5}
            fill="#475569"
          />
          {args.showVertices
            ? clippedPolygon2d.map((point, index) => {
                const mapped = mapPlanePointToSvg(point);

                return (
                  <circle
                    key={`${point.x}-${point.y}-${index}`}
                    cx={mapped.x}
                    cy={mapped.y}
                    r={4}
                    fill="#0369a1"
                  />
                );
              })
            : null}
          <circle
            cx={mapPlanePointToSvg(cameraTopViewPoint).x}
            cy={mapPlanePointToSvg(cameraTopViewPoint).y}
            r={HANDLE_RADIUS}
            fill={isDragging ? "#f97316" : "#ef4444"}
            stroke="#ffffff"
            strokeWidth={3}
            onPointerDown={(event) => {
              setIsDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePoseFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (!isDragging) return;
              updatePoseFromPointer(event);
            }}
            onPointerUp={(event) => {
              setIsDragging(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        </svg>
      </div>
    </div>
  );
};

const meta = {
  title: "Common/Math",
  component: PerspectiveClipPlanesPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    targetShape: "circle",
    fovVerticalDeg: 60,
    fovHorizontalDeg: 85.461115,
    rollDeg: 0,
    nearUnit: 0,
    farUnit: 0,
    circleSegments: DEFAULT_CIRCLE_SEGMENTS,
    showVertices: false,
  },
  argTypes: {
    targetShape: {
      name: "target",
      options: ["circle", "square"],
      control: { type: "inline-radio" },
    },
    fovVerticalDeg: {
      name: "fov v deg",
      control: { type: "range", min: 1, max: 179, step: 0.1 },
    },
    fovHorizontalDeg: {
      name: "fov h deg",
      control: { type: "range", min: 1, max: 179, step: 0.1 },
    },
    rollDeg: {
      name: "roll deg",
      control: { type: "range", min: -180, max: 180, step: 0.1 },
    },
    nearUnit: {
      name: "near u",
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    farUnit: {
      name: "far u",
      control: { type: "range", min: 0, max: 2, step: 0.01 },
    },
    circleSegments: {
      name: "circle segs",
      control: { type: "range", min: 8, max: 256, step: 1 },
      if: { arg: "targetShape", eq: "circle" },
    },
    showVertices: {
      name: "show vertices",
      control: { type: "boolean" },
    },
  },
} satisfies Meta<typeof PerspectiveClipPlanesPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PerspectiveClipPlanes: Story = {};
