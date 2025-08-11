import React, { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  Math as CesiumMath,
} from "cesium";
import {
  useCesiumContext,
  cesiumCameraToCssTransform,
  cssPerspectiveFromCesiumCameraForElement,
  getOrbitPoint,
  cancelViewerAnimation,
} from "@carma-mapping/cesium-engine";
import {
  CardinalDirectionEnum,
  CardinalLetters,
  InvertedCardinalDirectionEnum,
} from "../utils/orientationUtils";
import Face3D from "./ObliqueOrientationCube.Face3D";
import SelectorAnchor from "./ObliqueOrientationCube.SelectorAnchor";

type Props = {
  size?: number;
  onDirectionSelect?: (dir: CardinalDirectionEnum) => void;
  rotateCamera?: (clockwise: boolean) => void;
  onHeadingSelect?: (heading: number) => void;
  offsetRad?: number;
  bottomColorRgb?: string;
  offsetCube?: boolean;
  invertCardinalLabels?: boolean;
  showFacadeLabels?: boolean;
  faceHoverBgToken?: string;
  arrowColorToken?: string;
  arrowHoverColorToken?: string;
};

const eps = 0.001;
const MIN_PITCH = CesiumMath.toRadians(-70);
const MAX_PITCH = CesiumMath.toRadians(-30);
const HEADING_FACTOR = 1;
const PITCH_FACTOR = 1;

const getTransforms = (tz: number) => ({
  top: `translateZ(${tz}px)`,
  bottom: `translateZ(${-tz}px)`,
  front: `matrix3d(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,${tz},0,1)`,
  back: `matrix3d(-1,0,0,0, 0,0,-1,0, 0,-1,0,0, 0,${-tz},0,1)`,
  left: `matrix3d(0,1,0,0, 0,0,-1,0, -1,0,0,0, ${-tz},0,0,1)`,
  right: `matrix3d(0,-1,0,0, 0,0,-1,0, 1,0,0,0, ${tz},0,0,1)`,
});

const ArrowSvg = (
  size: number = 100,
  className?: string,
  onActivate?: () => void,
  disabled: boolean = false
) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{ pointerEvents: "none" }}
  >
    <polygon
      points="50,15 80,75 50,60 20,75"
      className={className}
      fill="currentColor"
      pointerEvents={disabled ? "none" : "visibleFill"}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Auf Nordausrichtung setzen"
      onMouseDown={(e) => {
        if (disabled) return;
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onActivate?.();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
    />
  </svg>
);

const ObliqueOrientationCube: React.FC<Props> = ({
  size = 100,
  onDirectionSelect,
  rotateCamera,
  onHeadingSelect,
  offsetRad = 0,
  bottomColorRgb = "255,255,255",
  offsetCube = false,
  invertCardinalLabels = true,
  showFacadeLabels = true,
  faceHoverBgToken = "yellow-100",
  arrowColorToken = "gray-500",
  arrowHoverColorToken = "yellow-500",
}) => {
  const half = size / 2;

  const {
    viewerRef,
    isViewerReady,
    viewerAnimationMapRef,
    shouldSuspendPitchLimiterRef,
  } = useCesiumContext();
  const [, setTransformTick] = useState(0);
  const [perspectivePx, setPerspectivePx] = useState<number>(1600);
  const lastPerspectiveRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousPercentageChangedRef = useRef<number | undefined>(undefined);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastMouseYRef = useRef(0);
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const rangeRef = useRef(0);
  const targetHeadingRef = useRef(0);
  const targetPitchRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // angle utils
  const shortestAngleDelta = (a: number, b: number) => {
    let d = (b - a + Math.PI) % (2 * Math.PI);
    if (d < 0) d += 2 * Math.PI;
    return d - Math.PI;
  };

  const stepAnimation = () => {
    if (
      !viewerRef.current ||
      !orbitPointRef.current ||
      !isDraggingRef.current
    ) {
      animFrameRef.current = null;
      return;
    }
    const viewer = viewerRef.current;
    const camera = viewer.camera;
    const currentHeading = camera.heading;
    const currentPitch = camera.pitch;
    const targetH = targetHeadingRef.current;
    const targetP = targetPitchRef.current;
    const easing = 0.25; // smoothing factor per frame
    const dh = shortestAngleDelta(currentHeading, targetH);
    const dp = targetP - currentPitch;
    const nextHeading = currentHeading + dh * easing;
    const nextPitch = CesiumMath.clamp(
      currentPitch + dp * easing,
      MIN_PITCH,
      MAX_PITCH
    );
    viewer.camera.lookAt(
      orbitPointRef.current,
      new HeadingPitchRange(nextHeading, nextPitch, rangeRef.current)
    );
    animFrameRef.current = requestAnimationFrame(stepAnimation);
  };

  const directionEnum = invertCardinalLabels
    ? InvertedCardinalDirectionEnum
    : CardinalDirectionEnum;
  const cardinalLetters = CardinalLetters.DE;
  const getLetter = (key: number) =>
    cardinalLetters.get(key as CardinalDirectionEnum);

  // Enum-keyed selector configuration to avoid repetition
  const SELECTOR_CONFIG: ReadonlyArray<{
    dir: CardinalDirectionEnum;
    ox: number; // x offset multiplier (-1, 0, 1)
    oy: number; // y offset multiplier (-1, 0, 1)
    tooltip: string;
    aria: string;
    labelKey: number; // resolved enum value for label mapping (accounts for inversion)
  }> = [
    {
      dir: CardinalDirectionEnum.North,
      ox: 0,
      oy: 1,
      tooltip: "Blick nach Norden auf Südseite",
      aria: "Select North",
      labelKey: directionEnum.North,
    },
    {
      dir: CardinalDirectionEnum.South,
      ox: 0,
      oy: -1,
      tooltip: "Blick nach Süden auf Nordseite",
      aria: "Select South",
      labelKey: directionEnum.South,
    },
    {
      dir: CardinalDirectionEnum.East,
      ox: -1,
      oy: 0,
      tooltip: "Blick nach Osten auf Westseite",
      aria: "Select East",
      labelKey: directionEnum.East,
    },
    {
      dir: CardinalDirectionEnum.West,
      ox: 1,
      oy: 0,
      tooltip: "Blick nach Westen auf Ostseite",
      aria: "Select West",
      labelKey: directionEnum.West,
    },
  ];

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!isViewerReady || !viewer || viewer.isDestroyed()) return;
    const camera = viewer.camera;
    const lastRef = { h: camera.heading, p: camera.pitch };
    const onChanged = () => {
      const h = camera.heading;
      const p = camera.pitch;
      if (Math.abs(h - lastRef.h) > eps || Math.abs(p - lastRef.p) > eps) {
        lastRef.h = h;
        lastRef.p = p;
        setTransformTick((t) => t + 1);
      }
    };
    camera.percentageChanged = Math.max(camera.percentageChanged ?? 0.01, 0.01);
    camera.changed.addEventListener(onChanged);
    onChanged();
    return () => {
      camera.changed.removeEventListener(onChanged);
    };
  }, [viewerRef, isViewerReady, size]);

  // Track FOV/aspect changes even when camera pose doesn't change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!isViewerReady || !viewer || viewer.isDestroyed()) return;
    const camera = viewer.camera;
    const scene = viewer.scene;

    const updateFrustum = () => {
      try {
        // Use the Cesium viewer container dimensions for perspective mapping so the cube scales with the scene
        const p = cssPerspectiveFromCesiumCameraForElement(
          viewer.container,
          camera,
          lastPerspectiveRef.current ?? 1600
        );
        if (!Number.isFinite(p)) return;
        const prevP = lastPerspectiveRef.current ?? Number.NaN;
        const changedP =
          !Number.isFinite(prevP) ||
          Math.abs((p as number) - (prevP as number)) > 0.5;

        if (changedP) {
          setPerspectivePx(p);
          lastPerspectiveRef.current = p as number;
        }
      } catch {
        // ignore
      }
    };

    scene.preRender.addEventListener(updateFrustum);
    // run once
    updateFrustum();
    return () => {
      scene.preRender.removeEventListener(updateFrustum);
    };
  }, [viewerRef, isViewerReady, size]);

  // Build forward scene transform and inverse (for billboarding labels)
  const cam = viewerRef.current?.camera;
  const [sceneTransform, inverseSceneTransform] = cam
    ? cesiumCameraToCssTransform(cam, { offsetRad: offsetCube ? offsetRad : 0 })
    : ["", ""];
  // Labels should optionally receive the offset even when the cube does not
  const labelsSceneTransform = offsetCube
    ? sceneTransform
    : `${sceneTransform} rotateZ(${offsetRad}rad)`;
  const labelsInverseTransform = offsetCube
    ? inverseSceneTransform
    : `rotateZ(${-offsetRad}rad) ${inverseSceneTransform}`;
  // North arrow always compensates imagery offset to point to geographic north
  const northArrowTransform = offsetCube ? `rotateZ(${-offsetRad}rad)` : "";

  // Face size and translation distance
  const face = size;
  const tz = half; // translateZ by half size to position faces
  const labelRadius = face * 0.9;
  const discSize = face * 2; // circular disc diameter equals 2x cube edge length
  const containerSize = discSize; // ensure container fully contains the disc (dome)
  const bottomColorInner = `rgba(${bottomColorRgb}, 0.4)`;
  const bottomColorOuter = `rgba(${bottomColorRgb}, 0.0)`;
  const bottomGradient = `radial-gradient(circle closest-side, ${bottomColorInner} 0 90%, ${bottomColorOuter} 100%)`;
  // Facade labels (DE) indexed by CardinalDirectionEnum order: [North, East, South, West]
  // leading white space offsets the shy hyphen
  const FACADE_LABELS_DE: readonly string[] = [
    "NORD\u200bSEITE",
    "OST\u200bSEITE",
    "SÜD\u200bSEITE",
    "WEST\u200bSEITE",
  ];
  // Facade label font sizing (~20% larger relative to face)
  const facadeFontSize = face * 0.28;

  const transforms = getTransforms(tz);
  const arrowSize = face * 0.8;

  // Drag handlers (mirror PitchingCompass behavior)
  // constants lifted to module scope to stabilize effect deps

  const handleNorthArrowClick = () => {
    // Prefer animated heading change if provided by parent
    if (onHeadingSelect) {
      onHeadingSelect(0);
      return;
    }
    // Fallback: instant snap (legacy behavior)
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    const viewer = viewerRef.current;
    if (viewerAnimationMapRef?.current) {
      cancelViewerAnimation(viewer, viewerAnimationMapRef.current);
    }
    const camera = viewer.camera;
    const target = getOrbitPoint(viewer);
    if (target) {
      const range = Cartesian3.distance(target, camera.positionWC);
      viewer.camera.lookAt(
        target,
        new HeadingPitchRange(0, camera.pitch, range)
      );
      // exit lookAt mode to avoid locking transform
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    // Allow dragging only with primary button
    if (event.button !== 0) return;
    event.preventDefault();
    shouldSuspendPitchLimiterRef.current = true;
    if (viewerAnimationMapRef?.current) {
      cancelViewerAnimation(viewerRef.current, viewerAnimationMapRef.current);
    }
    const camera = viewerRef.current.camera;
    // make camera.changed fire more often during drag
    previousPercentageChangedRef.current = camera.percentageChanged ?? 0.01;
    camera.percentageChanged = 0.002;
    setIsDragging(true);
    isDraggingRef.current = true;
    lastMouseXRef.current = event.clientX;
    lastMouseYRef.current = event.clientY;
    targetHeadingRef.current = camera.heading;
    targetPitchRef.current = camera.pitch;
    const target = getOrbitPoint(viewerRef.current);
    if (target) {
      const range = Cartesian3.distance(target, camera.positionWC);
      orbitPointRef.current = target;
      rangeRef.current = range;
    } else {
      orbitPointRef.current = null;
    }
    if (!animFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(stepAnimation);
    }
  };

  const handleMouseUp = React.useCallback(() => {
    shouldSuspendPitchLimiterRef.current = false;
    setIsDragging(false);
    isDraggingRef.current = false;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    const camera = viewerRef.current.camera;
    // restore percentageChanged after drag
    if (previousPercentageChangedRef.current !== undefined) {
      camera.percentageChanged = previousPercentageChangedRef.current;
    }
    viewerRef.current.camera.lookAtTransform(Matrix4.IDENTITY);
  }, [viewerRef, shouldSuspendPitchLimiterRef]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastMouseXRef.current;
      const dy = event.clientY - lastMouseYRef.current;
      lastMouseXRef.current = event.clientX;
      lastMouseYRef.current = event.clientY;
      // update targets incrementally
      targetHeadingRef.current =
        targetHeadingRef.current + dx * 0.01 * HEADING_FACTOR;
      targetHeadingRef.current =
        ((targetHeadingRef.current + Math.PI) % (2 * Math.PI)) - Math.PI;
      targetPitchRef.current = CesiumMath.clamp(
        targetPitchRef.current - dy * 0.01 * PITCH_FACTOR,
        MIN_PITCH,
        MAX_PITCH
      );
    };
    const onUp = () => handleMouseUp();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, handleMouseUp]);

  // Ensure rAF is cancelled on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // Compute effective classes: use deprecated class props if present; else build from tokens
  const hoverFaceClassEffective = `hover:bg-${faceHoverBgToken}`;
  const arrowBaseClassEffective = `text-${arrowColorToken}`;
  const arrowHoverClassEffective = `hover:text-${arrowHoverColorToken}`;

  const faceClassName = `bg-white/50 border border-gray-200 active:cursor-grabbing cursor-grab ${
    !isDragging ? hoverFaceClassEffective : ""
  }`;

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        width: containerSize,
        height: containerSize,
        perspective: perspectivePx,
      }}
    >
      {/* 3D cube scene */}
      <div
        className="absolute inset-0 grid place-items-center select-none"
        style={{
          cursor: isDragging ? "grabbing" : "default",
          transformStyle: "preserve-3d",
          transform: sceneTransform,
        }}
        role="button"
        aria-label="Drag to rotate camera; use Left/Right arrows to rotate"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            rotateCamera?.(false);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            rotateCamera?.(true);
          }
        }}
      >
        {/* Cube wrapper */}
        <div
          className="relative"
          style={{ width: face, height: face, transformStyle: "preserve-3d" }}
        >
          {/* Top */}
          <Face3D
            className="bg-white/70 border border-gray-300 cursor-grab active:cursor-grabbing"
            transform={transforms.top}
            width={face}
            height={face}
            facadeFontSize={facadeFontSize}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            {/* North arrow overlay is rendered separately to remain clickable */}
          </Face3D>

          {/* Clickable North Arrow overlay (counter-rotated to geographic north) */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
            style={{
              width: face,
              height: face,
              transform: transforms.top,
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ transform: northArrowTransform }}
            >
              {ArrowSvg(
                arrowSize,
                `${arrowBaseClassEffective} ${arrowHoverClassEffective} cursor-pointer`,
                handleNorthArrowClick
              )}
            </div>
          </div>

          {/* Bottom - circular disc with radial gradient */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="absolute left-0 top-0"
            style={{
              width: face,
              height: face,
              transform: transforms.bottom,
              transformStyle: "preserve-3d",
              overflow: "visible",
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            <div
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                width: discSize,
                height: discSize,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background: bottomGradient,
              }}
            />
          </div>
          {/* Front (South) */}
          <Face3D
            className={faceClassName}
            transform={transforms.front}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.South]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={() => {
              if (isDraggingRef.current) return;
              onDirectionSelect?.(CardinalDirectionEnum.North);
            }}
            role="button"
            tabIndex={0}
            ariaLabel="Select North (front face)"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isDraggingRef.current)
                  onDirectionSelect?.(CardinalDirectionEnum.North);
              }
            }}
          />
          {/* Back (North) */}
          <Face3D
            className={faceClassName}
            transform={transforms.back}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.North]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={() => {
              if (isDraggingRef.current) return;
              onDirectionSelect?.(CardinalDirectionEnum.South);
            }}
            role="button"
            tabIndex={0}
            ariaLabel="Select South (back face)"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isDraggingRef.current)
                  onDirectionSelect?.(CardinalDirectionEnum.South);
              }
            }}
          />
          {/* Left (West) */}
          <Face3D
            className={faceClassName}
            transform={transforms.left}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.West]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={() => {
              if (isDraggingRef.current) return;
              onDirectionSelect?.(CardinalDirectionEnum.East);
            }}
            role="button"
            tabIndex={0}
            ariaLabel="Select East (left face)"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isDraggingRef.current)
                  onDirectionSelect?.(CardinalDirectionEnum.East);
              }
            }}
          />
          {/* Right (East) */}
          <Face3D
            className={faceClassName}
            transform={transforms.right}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.East]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={() => {
              if (isDraggingRef.current) return;
              onDirectionSelect?.(CardinalDirectionEnum.West);
            }}
            role="button"
            tabIndex={0}
            ariaLabel="Select West (right face)"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isDraggingRef.current)
                  onDirectionSelect?.(CardinalDirectionEnum.West);
              }
            }}
          />
        </div>
      </div>

      {/* CCW / CW rotate buttons in bottom corners */}
      <div className="absolute left-0 bottom-0 p-0">
        <Tooltip title="Gegen Uhrzeigersinn drehen">
          <Button
            size="small"
            shape="circle"
            onClick={() => rotateCamera?.(false)}
            aria-label="Rotate left"
          >
            ↺
          </Button>
        </Tooltip>
      </div>
      <div className="absolute right-0 bottom-0 p-0">
        <Tooltip title="Im Uhrzeigersinn drehen">
          <Button
            size="small"
            shape="circle"
            onClick={() => rotateCamera?.(true)}
            aria-label="Rotate right"
          >
            ↻
          </Button>
        </Tooltip>
      </div>
      {/* NSOW selectors anchored in 3D at face centers; buttons billboard to the viewer */}
      <div
        className={`absolute inset-0 transition-opacity duration-150 ${
          isDragging ? "opacity-0" : "opacity-100"
        }`}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="absolute inset-0"
          style={{
            pointerEvents: "none",
            transformStyle: "preserve-3d",
            transform: labelsSceneTransform,
          }}
        >
          {/* Common styles for anchor containers: centered at cube origin, then 3D translated */}
          {SELECTOR_CONFIG.map((cfg) => (
            <SelectorAnchor
              key={cfg.dir}
              translate3d={`translate3d(${cfg.ox * labelRadius}px, ${
                cfg.oy * labelRadius
              }px, ${half}px)`}
              tooltip={cfg.tooltip}
              aria={cfg.aria}
              onClick={() => onDirectionSelect?.(cfg.dir)}
              label={getLetter(cfg.labelKey)}
              billboardTransform={labelsInverseTransform}
              disabled={isDragging}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ObliqueOrientationCube;
