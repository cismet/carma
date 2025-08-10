import React, { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import {
  useCesiumContext,
  cesiumCameraToCssTransform,
  cssPerspectiveFromCesiumCameraForElement,
} from "@carma-mapping/cesium-engine";
import {
  CardinalDirectionEnum,
  CardinalLetters,
  InvertedCardinalDirectionEnum,
} from "../utils/orientationUtils";
import Face3D from "./Face3D";
import SelectorAnchor from "./SelectorAnchor";

type Props = {
  size?: number; // px size of the square control
  onDirectionSelect?: (dir: CardinalDirectionEnum) => void;
  rotateCamera?: (clockwise: boolean) => void;
  offsetRad?: number;
  bottomColorRgb?: string; // e.g. "255,255,255"
  offsetCube?: boolean; // apply imagery offset to cube orientation as well (default true)
  invertCardinalLabels?: boolean; // invert cardinal directions (default true)
  showFacadeLabels?: boolean; // show facade labels on faces
};

const eps = 0.00872665; // ~0.5° in rad

const getTransforms = (tz: number) => ({
  // keep top/bottom as simple translateZ
  top: `translateZ(${tz}px)`,
  bottom: `translateZ(${-tz}px)`,
  front: `matrix3d(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,${tz},0,1)`,
  back: `matrix3d(-1,0,0,0, 0,0,-1,0, 0,-1,0,0, 0,${-tz},0,1)`,
  left: `matrix3d(0,1,0,0, 0,0,-1,0, -1,0,0,0, ${-tz},0,0,1)`,
  right: `matrix3d(0,-1,0,0, 0,0,-1,0, 1,0,0,0, ${tz},0,0,1)`,
  //front: `rotateX(${-PI_OVER_2}rad) translateZ(${tz}px)`,
  //back: `rotateY(${Math.PI}rad) rotateX(${PI_OVER_2}rad) translateZ(${tz}px)`,
  //left: `rotateX(${-PI_OVER_2}rad) rotateY(${-PI_OVER_2}rad) translateZ(${tz}px)`,
  //right: `rotateX(${-PI_OVER_2}rad) rotateY(${PI_OVER_2}rad) translateZ(${tz}px)`,
});

const ArrowSvg = (size: number = 100, color: string = "#ffaaaaaa") => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <polygon points="50,15 80,75 50,60 20,75" fill={color} />
  </svg>
);

/**
 * ObliqueOrientationCube
 *
 * Renders a CSS 3D cube whose orientation matches the camera heading and pitch.
 * A north arrow on the top face counter-rotates to always point to geographic north.
 * N/W/O/S selection controls are shown as pseudo-spheres positioned around the cube.
 */
const ObliqueOrientationCube: React.FC<Props> = ({
  size = 100,
  onDirectionSelect,
  rotateCamera,
  offsetRad = 0,
  bottomColorRgb = "255,255,255",
  offsetCube = false,
  invertCardinalLabels = true,
  showFacadeLabels = true,
}) => {
  const half = size / 2;

  const { viewerRef, isViewerReady } = useCesiumContext();
  const [, setTransformTick] = useState(0);
  const [perspectivePx, setPerspectivePx] = useState<number>(1600);
  const lastPerspectiveRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const directionEnum = invertCardinalLabels
    ? InvertedCardinalDirectionEnum
    : CardinalDirectionEnum;
  const cardinalLetters = CardinalLetters.DE;
  const getLetter = (key: number) =>
    cardinalLetters.get(key as CardinalDirectionEnum);

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
  const labelRadius = face * 0.8;
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
        className="absolute inset-0 grid place-items-center"
        style={{ transformStyle: "preserve-3d", transform: sceneTransform }}
      >
        {/* Cube wrapper */}
        <div
          className="relative"
          style={{ width: face, height: face, transformStyle: "preserve-3d" }}
        >
          {/* Top */}
          <Face3D
            className="bg-white/70 border border-gray-300"
            transform={transforms.top}
            width={face}
            height={face}
            facadeFontSize={facadeFontSize}
            style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.1)" }}
          >
            {/* North arrow (SVG), counter-rotated to keep pointing north */}
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ transform: northArrowTransform }}
            >
              {ArrowSvg(face)}
            </div>
          </Face3D>

          {/* Bottom - circular disc with radial gradient */}
          <div
            className="absolute left-0 top-0"
            style={{
              width: face,
              height: face,
              transform: transforms.bottom,
              transformStyle: "preserve-3d",
              overflow: "visible",
            }}
          >
            <div
              className="absolute"
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
            className="bg-white/80 border border-gray-300"
            transform={transforms.front}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.South]}
          />
          {/* Back (North) */}
          <Face3D
            className="bg-white/50 border border-gray-200"
            transform={transforms.back}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.North]}
          />
          {/* Left (West) */}
          <Face3D
            className="bg-white/70 border border-gray-200"
            transform={transforms.left}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.West]}
          />
          {/* Right (East) */}
          <Face3D
            className="bg-white/70 border border-gray-200"
            transform={transforms.right}
            width={face}
            height={face}
            showLabel={showFacadeLabels}
            facadeFontSize={facadeFontSize}
            label={FACADE_LABELS_DE[CardinalDirectionEnum.East]}
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
        className="absolute inset-0"
        style={{
          pointerEvents: "none",
          transformStyle: "preserve-3d",
          transform: labelsSceneTransform,
        }}
      >
        {/* Common styles for anchor containers: centered at cube origin, then 3D translated */}
        <SelectorAnchor
          translate3d={`translate3d(0px, ${labelRadius}px, 0px)`}
          tooltip="Blick nach Norden auf Südseite"
          aria="Select North"
          onClick={() => onDirectionSelect?.(CardinalDirectionEnum.North)}
          label={getLetter(directionEnum.North)}
          billboardTransform={labelsInverseTransform}
        />
        <SelectorAnchor
          translate3d={`translate3d(0px, ${-labelRadius}px, 0px)`}
          tooltip="Blick nach Süden auf Nordseite"
          aria="Select South"
          onClick={() => onDirectionSelect?.(CardinalDirectionEnum.South)}
          label={getLetter(directionEnum.South)}
          billboardTransform={labelsInverseTransform}
        />
        <SelectorAnchor
          translate3d={`translate3d(${-labelRadius}px, 0px, 0px)`}
          tooltip="Blick nach Osten auf Westseite"
          aria="Select East"
          onClick={() => onDirectionSelect?.(CardinalDirectionEnum.East)}
          label={getLetter(directionEnum.East)}
          billboardTransform={labelsInverseTransform}
        />
        <SelectorAnchor
          translate3d={`translate3d(${labelRadius}px, 0px, 0px)`}
          tooltip="Blick nach Westen auf Ostseite"
          aria="Select West"
          onClick={() => onDirectionSelect?.(CardinalDirectionEnum.West)}
          label={getLetter(directionEnum.West)}
          billboardTransform={labelsInverseTransform}
        />
      </div>
    </div>
  );
};

export default ObliqueOrientationCube;
