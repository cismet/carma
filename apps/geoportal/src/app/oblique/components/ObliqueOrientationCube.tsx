import React, { useEffect, useRef, useState } from "react";
import { Button, Tooltip, Spin } from "antd";
import { Cartesian3, HeadingPitchRange, Matrix4 } from "@carma/cesium";

import {
  useCesiumContext,
  cesiumCameraToCssTransform,
  pickSceneCenter,
  cancelSceneAnimation,
  guardCamera,
} from "@carma-mapping/engines/cesium";

import {
  CardinalDirectionEnum,
  CardinalLetters,
  InvertedCardinalDirectionEnum,
} from "../utils/orientationUtils";
import Face3D from "./ObliqueOrientationCube.Face3D";
import SelectorAnchor from "./ObliqueOrientationCube.SelectorAnchor";
import { useOrientationCubeDrag } from "./useOrientationCubeDrag";

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
  directionalButtonType?: "captureDirection" | "nextCapture";
  isLoading?: boolean;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

const eps = 0.001;

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
  styleColor?: string,
  onActivate?: () => void,
  disabled: boolean = false,
  style?: React.CSSProperties,
  onMouseEnter?: () => void,
  onMouseLeave?: () => void
) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{ pointerEvents: "none", ...(style ?? {}) }}
  >
    <polygon
      points="50,15 80,75 50,60 20,75"
      fill="currentColor"
      pointerEvents={disabled ? "none" : "visibleFill"}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Auf Nordausrichtung setzen"
      style={{ color: styleColor, transition: "color 150ms ease-in-out" }}
      onMouseEnter={() => {
        if (disabled) return;
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        if (disabled) return;
        onMouseLeave?.();
      }}
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
  directionalButtonType = "captureDirection",
  isLoading = false,
  siblingCallbacks,
}) => {
  const half = size / 2;

  const ctx = useCesiumContext();
  const { viewerRef, isViewerReady, sceneAnimationMapRef } = ctx;
  const [, setTransformTick] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFrustumRef = useRef<{ angle?: number; w?: number; h?: number }>({});

  // Drag state via custom hook
  const { isDragging, isDraggingRef, handleMouseDown, handleMouseUp } =
    useOrientationCubeDrag({ dragThresholdPx: 2 });

  // no-op: angle utils moved into drag hook

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
    let cleanup: (() => void) | undefined;
    ctx.withCamera((camera) => {
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
      camera.percentageChanged = Math.max(
        camera.percentageChanged ?? 0.01,
        0.01
      );
      camera.changed.addEventListener(onChanged);
      onChanged();
      cleanup = () => {
        guardCamera(camera).changed.removeEventListener(onChanged);
      };
    });
    return () => {
      cleanup?.();
    };
  }, [ctx, size]);

  // Ensure perspective updates even when only FOV/aspect/size changes (pose unchanged)
  useEffect(() => {
    if (!ctx.isValidViewer()) return;
    let cleanup: (() => void) | undefined;
    ctx.withViewer((viewer) => {
      const camera = viewer.camera;
      const scene = viewer.scene;

      const updateFrustum = () => {
        try {
          const el = viewer.container as Element;
          const rect = el.getBoundingClientRect();
          const w = rect.width;
          const h = rect.height;
          const frustum = camera.frustum as unknown as {
            fovy?: number;
            _fovy?: number;
            aspectRatio?: number;
          };
          const fovy: number | undefined = frustum?.fovy ?? frustum?._fovy;
          if (!(w > 0) || !(h > 0) || !(typeof fovy === "number" && fovy > 0))
            return;
          const aspect: number =
            frustum?.aspectRatio ?? (w > 0 && h > 0 ? w / h : 1);
          const useW = w >= h;
          const angle = useW
            ? 2 * Math.atan(Math.tan(fovy / 2) * aspect)
            : fovy;
          const last = lastFrustumRef.current;
          const sameAngle =
            typeof last.angle === "number" &&
            Math.abs((last.angle as number) - angle) < 1e-6;
          const sameSize = last.w === w && last.h === h;
          if (!sameAngle || !sameSize) {
            lastFrustumRef.current = { angle, w, h };
            setTransformTick((t) => t + 1);
          }
        } catch {
          // ignore
        }
      };

      scene.preRender.addEventListener(updateFrustum);
      updateFrustum();
      cleanup = () => {
        scene.preRender.removeEventListener(updateFrustum);
      };
    });

    return () => {
      cleanup?.();
    };
  }, [viewerRef, isViewerReady, ctx]);

  // Build forward scene transform and inverse (for billboarding labels)
  const cam = viewerRef.current?.camera;
  const [sceneTransform, inverseSceneTransform, perspectivePx] = cam
    ? cesiumCameraToCssTransform(cam, {
        offsetRad: offsetCube ? offsetRad : 0,
        targetEl: viewerRef.current?.container,
        fallback: 1600,
      })
    : ["", "", 1600];
  // Labels should optionally receive the offset even when the cube does not
  const labelsSceneTransform = offsetCube
    ? sceneTransform
    : `${sceneTransform} rotateZ(${offsetRad}rad)`;
  const labelsInverseTransform = offsetCube
    ? inverseSceneTransform
    : `rotateZ(${-offsetRad}rad) ${inverseSceneTransform}`;
  // North arrow always compensates imagery offset to point to geographic north
  const northArrowTransform = offsetCube ? `rotateZ(${-offsetRad}rad)` : "";
  // Current camera heading (rad) for arrow-rotation compensation
  const currentHeadingRad = cam?.heading ?? 0;

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
  // Tooltips used when directionalButtonType === "nextCapture" (sibling navigation)
  const NEXT_TOOLTIPS_DE: Record<CardinalDirectionEnum, string> = {
    [CardinalDirectionEnum.North]: "Nächster Nachbar nach Norden",
    [CardinalDirectionEnum.East]: "Nächster Nachbar nach Osten",
    [CardinalDirectionEnum.South]: "Nächster Nachbar nach Süden",
    [CardinalDirectionEnum.West]: "Nächster Nachbar nach Westen",
  };
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
    if (!ctx.isValidViewer()) return;
    ctx.withViewer((viewer) => {
      if (sceneAnimationMapRef?.current) {
        cancelSceneAnimation(viewer.scene, sceneAnimationMapRef.current);
      }
      const camera = viewer.camera;
      const target = pickSceneCenter(viewer.scene);
      if (target) {
        const range = Cartesian3.distance(target, camera.positionWC);
        viewer.camera.lookAt(
          target,
          new HeadingPitchRange(0, camera.pitch, range)
        );
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        ctx.requestRender();
      }
    });
  };
  // Resolve color tokens to CSS colors for hover effects (limited map for defaults)
  const resolveColorToken = (token?: string): string | undefined => {
    if (!token) return undefined;
    const map: Record<string, string> = {
      "gray-500": "#6b7280",
      "gray-200": "#e5e7eb",
      "yellow-500": "#eab308",
      "yellow-100": "#fef9c3",
      white: "#ffffff",
    };
    return map[token];
  };

  const arrowBaseColor = resolveColorToken(arrowColorToken) ?? undefined;
  const arrowHoverColor =
    resolveColorToken(arrowHoverColorToken) ?? arrowBaseColor;
  const faceHoverBgColor = resolveColorToken(faceHoverBgToken);

  const faceBaseClassName = `bg-white/50 border border-gray-200 active:cursor-grabbing cursor-grab`;

  // Local hover states
  const [hoveredFace, setHoveredFace] = useState<
    "front" | "back" | "left" | "right" | null
  >(null);
  const [hoverNorth, setHoverNorth] = useState(false);

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
      {isLoading && (
        <div
          className="absolute inset-0 z-10 grid place-items-center select-none"
          style={{
            pointerEvents: "auto",
            background:
              "radial-gradient(circle closest-side, rgba(255,255,255,0.70) 0 50%, rgba(255,255,255,0) 100%)",
          }}
        >
          <div className="flex flex-col items-center">
            <Spin delay={1000} size="large" percent={"auto"} />
          </div>
        </div>
      )}
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
          style={{
            width: face,
            height: face,
            transformStyle: "preserve-3d",
            pointerEvents: isDragging ? "none" : "auto",
          }}
        >
          {/* Top */}
          <Face3D
            className="bg-white/70 border border-gray-300 pointer-events-none"
            transform={transforms.top}
            width={face}
            height={face}
            facadeFontSize={facadeFontSize}
          >
            {/* North arrow overlay is rendered separately to remain clickable */}
          </Face3D>

          {/* Clickable North Arrow overlay (counter-rotated to geographic north) */}
          {ArrowSvg(
            arrowSize,
            !isDragging && hoverNorth ? arrowHoverColor : arrowBaseColor,
            handleNorthArrowClick,
            isDragging,
            {
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `${transforms.top} translate(-50%, -50%) ${northArrowTransform}`,
              cursor: isDragging ? "default" : "pointer",
            },
            () => setHoverNorth(true),
            () => setHoverNorth(false)
          )}

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
            className={faceBaseClassName}
            transform={transforms.front}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.South]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setHoveredFace("front")}
            onMouseLeave={() => setHoveredFace(null)}
            style={{
              backgroundColor:
                !isDragging && hoveredFace === "front" && faceHoverBgColor
                  ? faceHoverBgColor
                  : undefined,
              transition: "background-color 150ms ease-in-out",
            }}
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
            className={faceBaseClassName}
            transform={transforms.back}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.North]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setHoveredFace("back")}
            onMouseLeave={() => setHoveredFace(null)}
            style={{
              backgroundColor:
                !isDragging && hoveredFace === "back" && faceHoverBgColor
                  ? faceHoverBgColor
                  : undefined,
              transition: "background-color 150ms ease-in-out",
            }}
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
            className={faceBaseClassName}
            transform={transforms.left}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.West]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setHoveredFace("left")}
            onMouseLeave={() => setHoveredFace(null)}
            style={{
              backgroundColor:
                !isDragging && hoveredFace === "left" && faceHoverBgColor
                  ? faceHoverBgColor
                  : undefined,
              transition: "background-color 150ms ease-in-out",
            }}
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
            className={faceBaseClassName}
            transform={transforms.right}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.East]}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setHoveredFace("right")}
            onMouseLeave={() => setHoveredFace(null)}
            style={{
              backgroundColor:
                !isDragging && hoveredFace === "right" && faceHoverBgColor
                  ? faceHoverBgColor
                  : undefined,
              transition: "background-color 150ms ease-in-out",
            }}
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
          {SELECTOR_CONFIG.map((cfg) => {
            const isNextCapture = directionalButtonType === "nextCapture";
            // Always point arrow away from cube center: base angle by anchor offset
            // Compensate with current camera heading and optional imagery offset
            const baseAngleRad = Math.atan2(cfg.oy, cfg.ox) + Math.PI / 2;
            // Rotate the up-arrow (↑) by +90° so that (ox,oy) maps to the visual outward direction
            const rotateRad = -currentHeadingRad + baseAngleRad + offsetRad;
            const label = isNextCapture ? "↑" : getLetter(cfg.labelKey);
            // Tooltips and mapping: in nextCapture, use raw cardinal directions (no rotation/inversion)
            const tooltip = isNextCapture
              ? NEXT_TOOLTIPS_DE[cfg.dir]
              : cfg.tooltip;
            const onClick = isNextCapture
              ? siblingCallbacks?.[cfg.dir]
              : () => onDirectionSelect?.(cfg.dir);
            const isDisabled =
              isDragging ||
              (isNextCapture ? !siblingCallbacks?.[cfg.dir] : false);
            return (
              <SelectorAnchor
                key={cfg.dir}
                translate3d={`translate3d(${cfg.ox * labelRadius}px, ${
                  cfg.oy * labelRadius
                }px, ${half}px)`}
                tooltip={tooltip}
                aria={cfg.aria}
                onClick={onClick}
                label={label}
                billboardTransform={labelsInverseTransform}
                disabled={isDisabled}
                color={arrowBaseColor}
                hoverColor={arrowHoverColor}
                rotateRad={isNextCapture ? rotateRad : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ObliqueOrientationCube;
