import { useEffect, useRef, useState } from "react";
import type { CameraPrimitive, CameraPoseRadians } from "@carma/cesium";
import { useCesiumContext } from "../../context/hooks/use-cesium-context";

/**
 * Camera initialization source types
 */
export type CameraInitSource =
  | "crash-recovery" // Restore from currentCameraStateRef after widget crash
  | "url-state" // Deep link with camera params in URL
  | "transition-2d" // Derived from 2D map position during 2D→3D transition
  | "cold-start"; // Config default (home position)

/**
 * Initial camera location from portal (2D map or URL state)
 */
export interface InitialCameraLocation {
  lat: number;
  lng: number;
  zoom: number;
  heading?: number; // Optional: heading in degrees
  pitch?: number; // Optional: pitch in degrees
  fov?: number; // Optional: field of view in degrees
  source?: "url" | "transition"; // Where this data came from
}

/**
 * Unified camera initialization hook.
 * Handles all 4 scenarios with priority order:
 * 1. Crash Recovery (highest priority)
 * 2. URL State
 * 3. 2D→3D Transition
 * 4. Cold Start (lowest priority)
 *
 * Output format: CameraPrimitive (Cesium internal state)
 * - position: Cartesian3
 * - direction: Cartesian3
 * - up: Cartesian3
 * - right: Cartesian3
 * - fov: number (radians)
 */
export const useDetermineInitialCameraState = ({
  initialCameraLocation,
}: {
  initialCameraLocation?: InitialCameraLocation;
}): {
  cameraState: CameraPrimitive | null;
  source: CameraInitSource;
  settled: boolean;
} => {
  const { config, currentCameraRef } = useCesiumContext();
  const [settled, setSettled] = useState(false);
  const determinedStateRef = useRef<{
    cameraState: CameraPrimitive | null;
    source: CameraInitSource;
  } | null>(null);

  useEffect(() => {
    // Only determine once on mount
    if (determinedStateRef.current) return;

    const determine = async () => {
      // Priority 1: Crash Recovery
      // If we have a last known camera state, restore it (widget remounted after error)
      if (currentCameraRef.current) {
        console.log(
          "[useDetermineInitialCameraState] Using crash recovery camera state"
        );
        determinedStateRef.current = {
          cameraState: currentCameraRef.current,
          source: "crash-recovery",
        };
        return;
      }

      // Priority 2 & 3: URL State or 2D Transition
      // Both use initialCameraLocation but may have different sources
      // NOTE: Actual camera positioning is delegated to tiledMapToCesium in scene component
      // This hook just determines the source and passes the position data
      if (initialCameraLocation) {
        const source =
          initialCameraLocation.source === "url"
            ? "url-state"
            : "transition-2d";
        console.log(
          `[useDetermineInitialCameraState] Using ${source} camera location:`,
          initialCameraLocation
        );
        console.log(
          `[useDetermineInitialCameraState] Camera positioning will be handled by tiledMapToCesium`
        );

        // Return null - scene component will use tiledMapToCesium for proper positioning
        determinedStateRef.current = {
          cameraState: null,
          source,
        };
        return;
      }

      // Priority 4: Cold Start (config default)
      // Use cameraHomePose from config
      if (config.cameraHomePose) {
        console.log(
          "[useDetermineInitialCameraState] Using cold start (config home pose)"
        );
        const cameraState = await convertCameraPoseToCameraPrimitive(
          config.cameraHomePose
        );
        determinedStateRef.current = {
          cameraState,
          source: "cold-start",
        };
        return;
      }

      // Fallback: No camera state available
      console.warn(
        "[useDetermineInitialCameraState] No camera state available - widget will use Cesium defaults"
      );
      determinedStateRef.current = {
        cameraState: null,
        source: "cold-start",
      };
    };

    determine().then(() => {
      setSettled(true);
    });
  }, [initialCameraLocation, currentCameraRef, config.cameraHomePose]);

  const result = determinedStateRef.current ?? {
    cameraState: null,
    source: "cold-start",
  };

  return {
    ...result,
    settled,
  };
};

/**
 * NOTE: Camera positioning logic removed - delegated to tiledMapToCesium
 *
 * The proper camera positioning with terrain sampling, DPR adjustment, and
 * iterative refinement is handled by tiledMapToCesium in @carma-mapping/map-transition-2d-3d.
 *
 * This hook only determines which camera source to use (crash recovery, URL, transition, or config).
 * The actual positioning happens in the scene component using the transition helpers.
 *
 * See: libraries/mapping/map-transition-2d-3d/src/lib/tiled-map-to-cesium.ts
 */

/**
 * Convert CameraPoseRadians (config format) to Cesium camera primitive.
 *
 * CameraPoseRadians format:
 * - lat, lng, altitude (radians/meters)
 * - heading, pitch, roll (radians)
 * - fov (radians)
 */
async function convertCameraPoseToCameraPrimitive(
  pose: CameraPoseRadians
): Promise<CameraPrimitive> {
  const { Cartesian3, Transforms, Matrix3, HeadingPitchRoll, CesiumMath } =
    await import("@carma/cesium");

  const { latitude, longitude, height, heading, pitch, roll } = pose;

  console.debug(`[CameraPose] Converting to Cesium primitive:`, {
    latitude: latitude
      ? `${((latitude * 180) / Math.PI).toFixed(6)}°`
      : "undefined",
    longitude: longitude
      ? `${((longitude * 180) / Math.PI).toFixed(6)}°`
      : "undefined",
    height: height ?? "undefined",
    heading: heading
      ? `${((heading * 180) / Math.PI).toFixed(1)}°`
      : "undefined",
    pitch: pitch ? `${((pitch * 180) / Math.PI).toFixed(1)}°` : "undefined",
  });

  // Create position from latitude/longitude/height
  // NOTE: Cartesian3.fromRadians uses (longitude, latitude, height)
  // height is elevation above WGS84 ellipsoid, NOT above ground
  const position = Cartesian3.fromRadians(longitude, latitude, height ?? 0);

  // Create heading-pitch-roll rotation matrix
  const hpr = new HeadingPitchRoll(
    heading ?? 0,
    pitch ?? CesiumMath.toRadians(-90), // Default to nadir
    roll ?? 0
  );
  const orientation = Transforms.headingPitchRollQuaternion(position, hpr);
  const rotationMatrix = Matrix3.fromQuaternion(orientation);

  // Extract direction, up, right vectors from rotation matrix
  const direction = Matrix3.getColumn(rotationMatrix, 0, new Cartesian3());
  const up = Matrix3.getColumn(rotationMatrix, 2, new Cartesian3());
  const right = Matrix3.getColumn(rotationMatrix, 1, new Cartesian3());

  return {
    position,
    direction: Cartesian3.normalize(direction, direction),
    up: Cartesian3.normalize(up, up),
    right: Cartesian3.normalize(right, right),
    frustum: {
      fov: CesiumMath.toRadians(60), // Default 60° FOV
    },
  };
}

export default useDetermineInitialCameraState;
