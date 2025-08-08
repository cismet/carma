import React, { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { Math as CesiumMath } from "cesium";
import {
  useCesiumContext,
  applyRollToHeadingForCameraNearNadir,
} from "@carma-mapping/cesium-engine";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

type Props = {
  size?: number; // px size of the square control
  onDirectionSelect?: (dir: CardinalDirectionEnum) => void;
  rotateCamera?: (clockwise: boolean) => void;
  offsetDegrees?: number;
};

/**
 * ObliqueOrientationCube
 *
 * Renders a CSS 3D cube whose orientation matches the camera heading and pitch.
 * A north arrow on the top face counter-rotates to always point to geographic north.
 * N/W/O/S selection controls are shown as pseudo-spheres positioned around the cube.
 */
const ObliqueOrientationCube: React.FC<Props> = ({
  size = 30,
  onDirectionSelect,
  rotateCamera,
  offsetDegrees = 0,
}) => {
  const half = size / 2;

  const { viewerRef, isViewerReady } = useCesiumContext();
  const [headingRad, setHeadingRad] = useState(0);
  const [pitchRad, setPitchRad] = useState(0);

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
  }, [viewerRef, isViewerReady]);

  const headingDeg = CesiumMath.toDegrees(headingRad);
  const pitchDeg = CesiumMath.toDegrees(pitchRad);
  // Map Cesium pitch (0 = side, -90 = top-down) so that:
  //  - at 0, the top face points to the user (rotateX(90))
  //  - at -90, the front face points to the user (rotateX(0))
  const mappedPitchX = pitchDeg;

  // Scene transform: apply heading around the top/bottom face axis (Y) first, then tilt by pitch (X)
  // Note: CSS applies transforms right-to-left, so heading (rightmost) is applied before pitch
  // Align cube with flight pattern north by compensating heading with offsetDegrees
  const sceneTransform = `rotateX(${mappedPitchX}deg) rotateY(${
    headingDeg - offsetDegrees
  }deg)`;
  // Pre-rotate the north arrow by the imagery offset (applied in face space before the 3D scene)
  const northArrowTransform = `rotateZ(${offsetDegrees}deg)`;

  // Face size and translation distance
  const face = size;
  const tz = half; // translateZ by half size to position faces

  return (
    <div
      className="relative"
      style={{ width: size, height: size, perspective: 600 }}
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

          {/* Bottom */}
          <div
            className="absolute left-0 top-0 bg-white/60 border border-gray-200"
            style={{
              width: face,
              height: face,
              transform: `rotateX(-90deg) translateZ(${tz}px)`,
            }}
          />
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

      {/* CCW / CW rotate buttons in top corners */}
      <div className="absolute left-0 top-0 p-1">
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
      <div className="absolute right-0 top-0 p-1">
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

      {/* Pseudo-spherical NSOW selectors around the cube (2D overlay for clarity) */}
      <div className="absolute inset-0 pointer-events-none">
        {/* North */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-2">
          <Tooltip title="Nord">
            <button
              type="button"
              className="pointer-events-auto w-7 h-7 rounded-full shadow bg-gradient-to-b from-white to-gray-200 border border-gray-300 text-xs font-semibold"
              onClick={() => onDirectionSelect?.(CardinalDirectionEnum.North)}
              aria-label="Select North"
            >
              N
            </button>
          </Tooltip>
        </div>
        {/* West */}
        <div className="absolute top-1/2 -translate-y-1/2 -left-2">
          <Tooltip title="West">
            <button
              type="button"
              className="pointer-events-auto w-7 h-7 rounded-full shadow bg-gradient-to-b from-white to-gray-200 border border-gray-300 text-xs font-semibold"
              onClick={() => onDirectionSelect?.(CardinalDirectionEnum.West)}
              aria-label="Select West"
            >
              W
            </button>
          </Tooltip>
        </div>
        {/* East (Ost) */}
        <div className="absolute top-1/2 -translate-y-1/2 -right-2">
          <Tooltip title="Ost">
            <button
              type="button"
              className="pointer-events-auto w-7 h-7 rounded-full shadow bg-gradient-to-b from-white to-gray-200 border border-gray-300 text-xs font-semibold"
              onClick={() => onDirectionSelect?.(CardinalDirectionEnum.East)}
              aria-label="Select East"
            >
              O
            </button>
          </Tooltip>
        </div>
        {/* South */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2">
          <Tooltip title="Süd">
            <button
              type="button"
              className="pointer-events-auto w-7 h-7 rounded-full shadow bg-gradient-to-b from-white to-gray-200 border border-gray-300 text-xs font-semibold"
              onClick={() => onDirectionSelect?.(CardinalDirectionEnum.South)}
              aria-label="Select South"
            >
              S
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ObliqueOrientationCube;
