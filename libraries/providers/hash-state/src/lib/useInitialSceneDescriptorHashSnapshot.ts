import { useMemo } from "react";

import type { SceneDescriptorHashSnapshot } from "./sceneDescriptorHashCodec";
import {
  decodeSceneDescriptorHashSnapshot,
  readSceneDescriptorFromMapLibrePlusElevationHashValues,
} from "./sceneDescriptorHashCodec";
import { useHashState } from "./HashStateProvider";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isSceneDescriptorHashSnapshot = (
  value: unknown
): value is SceneDescriptorHashSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SceneDescriptorHashSnapshot>;
  const anchor = candidate.anchor;
  if (!anchor) {
    return false;
  }

  return (
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

const readInitialCameraSnapshotFromHashValues = (
  rawHash: Record<string, string>,
  hashValues: Record<string, unknown>,
  defaultFovDeg?: number,
  defaultZoom?: number
): SceneDescriptorHashSnapshot | null => {
  const encodedSnapshot = hashValues.camera3d;
  if (isSceneDescriptorHashSnapshot(encodedSnapshot)) {
    return encodedSnapshot;
  }

  const rawEncodedSnapshot = rawHash.camera3d ?? rawHash.c3;
  if (typeof rawEncodedSnapshot === "string") {
    const decodedSnapshot = decodeSceneDescriptorHashSnapshot(rawEncodedSnapshot);
    if (decodedSnapshot) {
      return decodedSnapshot;
    }
  }

  const lngDeg = hashValues.lng;
  const latDeg = hashValues.lat;
  const heightM = hashValues.altitude;
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return null;
  }

  const bearingDeg = hashValues.bearing;
  const pitchDeg = hashValues.pitch;
  const zoom = hashValues.zoom;
  const fovDeg = hashValues.fov;

  return readSceneDescriptorFromMapLibrePlusElevationHashValues({
    values: {
      lng: lngDeg,
      lat: latDeg,
      zoom: isFiniteNumber(zoom)
        ? zoom
        : isFiniteNumber(defaultZoom)
          ? defaultZoom
          : undefined,
      altitude: heightM,
      bearing: isFiniteNumber(bearingDeg) ? bearingDeg : undefined,
      pitch: isFiniteNumber(pitchDeg) ? pitchDeg : undefined,
      fov: isFiniteNumber(fovDeg) ? fovDeg : undefined,
    },
    ...(isFiniteNumber(defaultFovDeg) ? { defaultFovDeg } : {}),
    viewportWidthPx:
      typeof window === "undefined" ? 1920 : window.innerWidth,
    viewportHeightPx:
      typeof window === "undefined" ? 1080 : window.innerHeight,
  });
};

export const useInitialSceneDescriptorHashSnapshot = ({
  defaultFovDeg,
  defaultZoom,
}: {
  defaultFovDeg?: number;
  defaultZoom?: number;
} = {}): {
  initialCameraState: SceneDescriptorHashSnapshot | null;
  isResolved: boolean;
} => {
  const { getHash, getHashValues } = useHashState();

  return useMemo(() => {
    const rawHash = getHash();
    const hashValues = getHashValues();
    return {
      initialCameraState: readInitialCameraSnapshotFromHashValues(
        rawHash,
        hashValues,
        defaultFovDeg,
        defaultZoom
      ),
      isResolved: true,
    };
  }, [defaultFovDeg, defaultZoom, getHash, getHashValues]);
};