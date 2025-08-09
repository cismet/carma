import React, { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { Math as CesiumMath } from "cesium";
import {
  useCesiumContext,
  applyRollToHeadingForCameraNearNadir,
} from "@carma-mapping/cesium-engine";
import {
  cssPerspectiveFromCesiumFrustumForElement,
  type CesiumFrustumLike,
} from "@carma-commons/utils";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

type Props = {
  size?: number; // px size of the square control
  onDirectionSelect?: (dir: CardinalDirectionEnum) => void;
  rotateCamera?: (clockwise: boolean) => void;
  offsetDegrees?: number;
  bottomColorRgb?: string; // e.g. "255,255,255"
};

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
  offsetDegrees = 0,
  bottomColorRgb = "255,255,255",
}) => {
  const half = size / 2;

  const { viewerRef, isViewerReady } = useCesiumContext();
  const [headingRad, setHeadingRad] = useState(0);
  const [pitchRad, setPitchRad] = useState(0);
  const [perspectivePx, setPerspectivePx] = useState<number>(1600);
  const lastPerspectiveRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!isViewerReady || !viewer || viewer.isDestroyed()) return;
    const camera = viewer.camera;
    const update = () => {
      // Use the same correction as PitchingCompass for stable heading near nadir
      setHeadingRad(applyRollToHeadingForCameraNearNadir(camera));
      setPitchRad(camera.pitch);
    };
    camera.percentageChanged = Math.max(camera.percentageChanged ?? 0.01, 0.01);
    camera.changed.addEventListener(update);
    // Initialize immediately
    update();
    return () => {
      camera.changed.removeEventListener(update);
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
        const frustum = camera.frustum as unknown as CesiumFrustumLike;
        // Use the Cesium viewer container dimensions for perspective mapping so the cube scales with the scene
        const p = cssPerspectiveFromCesiumFrustumForElement(
          viewer.container,
          frustum,
          lastPerspectiveRef.current ?? 1600
        );
        if (!Number.isFinite(p)) return;

        const rect = viewer.container?.getBoundingClientRect?.();
        const w = rect?.width ?? size;
        const h = rect?.height ?? size;
        console.debug("[ObliqueOrientationCube] FOV→perspective", {
          longerDimension: w >= h ? "width" : "height",
          containerUsed: "viewer.container",
          container: { widthPx: w, heightPx: h },
          fovRad: frustum.fov,
          fovDeg:
            typeof frustum.fov === "number"
              ? CesiumMath.toDegrees(frustum.fov)
              : undefined,
          aspect:
            frustum.aspectRatio ??
            scene.drawingBufferWidth / Math.max(1, scene.drawingBufferHeight),
          perspectivePx: p,
        });
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

  const headingDeg = CesiumMath.toDegrees(headingRad);
  const pitchDeg = CesiumMath.toDegrees(pitchRad);
  // Map Cesium pitch (0 = side, -90 = top-down) so that:
  //  - at 0, the top face points to the user (rotateX(90))
  //  - at -90, the front face points to the user (rotateX(0))
  const mappedPitchX = pitchDeg;

  // Scene transform: apply heading around the top/bottom face axis (Y) first, then tilt by pitch (X)
  // Note: CSS applies transforms right-to-left, so heading (rightmost) is applied before pitch
  // Align cube with flight pattern north by compensating heading with offsetDegrees
  const headingAdj = headingDeg - offsetDegrees;
  const sceneTransform = `rotateX(${mappedPitchX}deg) rotateY(${headingAdj}deg)`;
  // Pre-rotate the north arrow by the imagery offset (applied in face space before the 3D scene)
  const northArrowTransform = `rotateZ(${offsetDegrees}deg)`;

  // Face size and translation distance
  const face = size;
  const tz = half; // translateZ by half size to position faces
  const discSize = face * 2; // make the circular disc radius equal to cube edge length
  const bottomColorInner = `rgba(${bottomColorRgb}, 0.4)`;
  const bottomColorOuter = `rgba(${bottomColorRgb}, 0.0)`;
  const bottomGradient = `radial-gradient(circle closest-side, ${bottomColorInner} 0 90%, ${bottomColorOuter} 100%)`;

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width: size, height: size, perspective: perspectivePx }}
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
          <div
            className="absolute left-0 top-0 bg-white/70 border border-gray-300"
            style={{
              width: face,
              height: face,
              transform: `rotateX(90deg) translateZ(${tz}px)`,
              transformStyle: "preserve-3d",
              boxShadow: "inset 0 0 10px rgba(0,0,0,0.1)",
            }}
          >
            {/* North arrow (SVG), counter-rotated to keep pointing north */}
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ transform: northArrowTransform }}
            >
              <svg width={face * 0.5} height={face * 0.5} viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="gradN" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                </defs>
                {/* Triangle arrow pointing up (north) */}
                <polygon points="50,5 70,70 50,50 30,70" fill="url(#gradN)" />
              </svg>
            </div>
          </div>

          {/* Bottom - circular disc with radial gradient */}
          <div
            className="absolute left-0 top-0"
            style={{
              width: face,
              height: face,
              transform: `rotateX(-90deg) translateZ(${tz}px)`,
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
          {/* Front */}
          <div
            className="absolute left-0 top-0 bg-white/80 border border-gray-300"
            style={{
              width: face,
              height: face,
              transform: `translateZ(${tz}px)`,
            }}
          />
          {/* Back */}
          <div
            className="absolute left-0 top-0 bg-white/50 border border-gray-200"
            style={{
              width: face,
              height: face,
              transform: `rotateY(180deg) translateZ(${tz}px)`,
            }}
          />
          {/* Left */}
          <div
            className="absolute left-0 top-0 bg-white/70 border border-gray-200"
            style={{
              width: face,
              height: face,
              transform: `rotateY(-90deg) translateZ(${tz}px)`,
            }}
          />
          {/* Right */}
          <div
            className="absolute left-0 top-0 bg-white/70 border border-gray-200"
            style={{
              width: face,
              height: face,
              transform: `rotateY(90deg) translateZ(${tz}px)`,
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
        className="absolute inset-0"
        style={{
          pointerEvents: "none",
          transformStyle: "preserve-3d",
          transform: sceneTransform,
        }}
      >
        {/* Common styles for anchor containers: centered at cube origin, then 3D translated */}
        {/* Front (South) face center: translateZ(+tz) */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translate3d(0px, 0px, ${tz}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              transform: `rotateY(${-headingAdj}deg) rotateX(${-mappedPitchX}deg)`,
              pointerEvents: "auto",
            }}
          >
            <Tooltip title="Blick nach Norden auf Südseite">
              <Button
                size="small"
                shape="circle"
                onClick={() => onDirectionSelect?.(CardinalDirectionEnum.North)}
                aria-label="Select North"
              >
                S
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Back (North) face center: translateZ(-tz) */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translate3d(0px, 0px, ${-tz}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              transform: `rotateY(${-headingAdj}deg) rotateX(${-mappedPitchX}deg)`,
              pointerEvents: "auto",
            }}
          >
            <Tooltip title="Blick nach Süden auf Nordseite">
              <Button
                size="small"
                shape="circle"
                onClick={() => onDirectionSelect?.(CardinalDirectionEnum.South)}
                aria-label="Select South"
              >
                N
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Left (West) face center: translateX(-tz) */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translate3d(${-tz}px, 0px, 0px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              transform: `rotateY(${-headingAdj}deg) rotateX(${-mappedPitchX}deg)`,
              pointerEvents: "auto",
            }}
          >
            <Tooltip title="Blick nach Osten auf Westseite">
              <Button
                size="small"
                shape="circle"
                onClick={() => onDirectionSelect?.(CardinalDirectionEnum.East)}
                aria-label="Select East"
              >
                W
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Right (East/Ost) face center: translateX(+tz) */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translate3d(${tz}px, 0px, 0px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              transform: `rotateY(${-headingAdj}deg) rotateX(${-mappedPitchX}deg)`,
              pointerEvents: "auto",
            }}
          >
            <Tooltip title="Blick nach Westen auf Ostseite">
              <Button
                size="small"
                shape="circle"
                onClick={() => onDirectionSelect?.(CardinalDirectionEnum.West)}
                aria-label="Select West"
              >
                O
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObliqueOrientationCube;
