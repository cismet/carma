import React, {
  createContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import debounce from "lodash/debounce";

import type { FeatureCollection, Polygon } from "geojson";

import { useHashState } from "@carma-apps/portals";

import type {
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueAnimationsConfig,
  ObliqueDataProviderConfig,
  ObliqueFootprintsStyle,
  ObliqueImagePreviewStyle,
  ObliqueImageRecordMap,
  ObliqueImageRecord,
  Proj4Converter,
} from "../types";

import { useObliqueData } from "../hooks/useObliqueData";

import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { FootprintProperties } from "../utils/footprintUtils";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { createConverter } from "../utils/crsUtils";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

// Simple haversine distance (meters)
const EARTH_RADIUS_M = 6371000;
function haversineMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Per-line flight direction helper type
type FlightLineDirection = { headingRad: number; sign: 1 | -1 };

interface ObliqueContextType {
  isObliqueMode: boolean;
  toggleObliqueMode: () => void;
  converter: Proj4Converter;

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;

  nearestImage: NearestObliqueImageRecord | null;
  setNearestImage: (image: NearestObliqueImageRecord | null) => void;
  nearestImageDistance: number | null;
  setNearestImageDistance: (distance: number | null) => void;

  nearestImageRefresh: () => void | null;
  setNearestImageRefresh: (refresh: () => void | null) => void;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;

  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;

  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY;
  previewPath: string;
  fixedPitch: number;
  fixedHeight: number;
  minFov: number;
  maxFov: number;
  headingOffset: number;

  animations: ObliqueAnimationsConfig;
  footprintsStyle: ObliqueFootprintsStyle;
  imagePreviewStyle: ObliqueImagePreviewStyle;

  // Navigation between captures in the flight grid
  navigateForward: () => void;
  navigateBackward: () => void;
  navigateLeft: () => void;
  navigateRight: () => void;
  // Provider-computed sibling candidates keyed by world cardinal directions
  siblingsByCardinal: Record<CardinalDirectionEnum, ObliqueImageRecord | null>;
  // Disabled state for each world cardinal direction in next-capture mode
  disabledDirections: Record<CardinalDirectionEnum, boolean>;
  // Generic navigation by world cardinal (uses siblingsByCardinal)
  navigateToCardinal: (dir: CardinalDirectionEnum) => void;

  // Flight direction metadata
  // Map of lineIndex -> { headingRad, sign } where sign=+1 means increasing photoIndex follows the reference direction,
  // and sign=-1 means it is inverted relative to the reference.
  flightDirectionByLine: Map<number, FlightLineDirection>;
  // Convenience: for the current line, true if "forward" index search should be inverted (i.e., decreasing photoIndex).
  isIndexSearchInvertedForCurrentLine: boolean;

  // Navigation by flight pattern: forward/back follow monotonic photoIndex; left/right jump adjacent strips.
  navigateByFlightPattern: (
    dir: "forward" | "backward" | "left" | "right"
  ) => void;
}

const ObliqueContext = createContext<ObliqueContextType | null>(null);

export { ObliqueContext };

interface ObliqueProviderProps {
  children: ReactNode;
  config: ObliqueDataProviderConfig;
  fallbackDirectionConfig: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >;
}

export const ObliqueProvider: React.FC<ObliqueProviderProps> = ({
  children,
  config,
  fallbackDirectionConfig,
}) => {
  const { updateHash, getHashValues } = useHashState();
  // Read initial oblique mode from hash only once on mount
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(() => {
    const { isOblique } = getHashValues();
    return isOblique === "1";
  });
  const [lockFootprint, setLockFootprint] = useState(false);
  const [nearestImage, setNearestImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const [nearestImageDistance, setNearestImageDistance] = useState<
    number | null
  >(null);
  const [nearestImageRefresh, setNearestImageRefresh] =
    useState<() => void | null>(null);

  const {
    exteriorOrientationsURI,
    footprintsURI,
    crs,
    previewPath,
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    animations,
    footprintsStyle,
    imagePreviewStyle,
  } = config;

  // Store when data has been previously loaded to prevent duplicate loads

  const converter = useMemo(() => createConverter(crs, "EPSG:4326"), [crs]);

  const {
    imageRecordMap: imageRecords,
    isLoading,
    isAllDataReady,
    exteriorOrientations,
    footprintCenterpointsRBushByCardinals,
    footprintData,
    error,
  } = useObliqueData(
    isObliqueMode,
    exteriorOrientationsURI,
    footprintsURI,
    converter,
    headingOffset,
    fallbackDirectionConfig
  );

  const performToggleAction = useCallback(() => {
    setIsObliqueMode((prevMode: boolean) => {
      const newMode = !prevMode;
      updateHash && updateHash({ isOblique: newMode ? "1" : undefined });
      return newMode;
    });
  }, [setIsObliqueMode, updateHash]); // setIsObliqueMode is stable

  const toggleObliqueMode = useMemo(
    () => debounce(performToggleAction, DEBOUNCE_MS, DEBOUNCE_LEADING_EDGE),
    [performToggleAction]
  );

  // Trigger nearest image search when data is loaded
  useEffect(() => {
    if (
      imageRecords &&
      isObliqueMode &&
      !lockFootprint &&
      typeof nearestImageRefresh === "function"
    ) {
      // TODO: check if this ever needed, remove if not
      nearestImageRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageRecords, isObliqueMode, nearestImageRefresh, lockFootprint]);

  // Compute per-line flight direction once from data. We compute a reference vector
  // from the first available line (low->high photoIndex), then define each line's sign
  // by the dot product against that reference. This yields an easy alternation flag per line.
  const flightDirectionByLine = useMemo(() => {
    const map = new Map<number, FlightLineDirection>();
    if (!imageRecords || imageRecords.size === 0) return map;

    const byLine = new Map<number, ObliqueImageRecord[]>();
    imageRecords.forEach((rec) => {
      const arr = byLine.get(rec.lineIndex) ?? [];
      arr.push(rec);
      byLine.set(rec.lineIndex, arr);
    });

    let refVec: [number, number] | null = null;
    byLine.forEach((recs, lineIndex) => {
      if (!recs || recs.length < 2) return;
      const sorted = [...recs].sort((a, b) => a.photoIndex - b.photoIndex);
      const a = sorted[0];
      const b = sorted[sorted.length - 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const mag = Math.hypot(vx, vy);
      if (mag < 1e-6) return;
      const headingRad = Math.atan2(vy, vx);
      if (!refVec) refVec = [vx, vy];
      const dot = refVec[0] * vx + refVec[1] * vy;
      const sign = (dot >= 0 ? 1 : -1) as 1 | -1;
      map.set(lineIndex, { headingRad, sign });
    });

    return map;
  }, [imageRecords]);

  const isIndexSearchInvertedForCurrentLine = useMemo(() => {
    // Updated assumption: stop points per lane increase west->east for all rows.
    // Only capture id zigzags; photoIndex order does not invert across lines.
    return false;
  }, []);

  // Memoized siblings for the current image by world cardinal
  const siblingsByCardinal = useMemo(() => {
    const map: Record<CardinalDirectionEnum, ObliqueImageRecord | null> = {
      [CardinalDirectionEnum.North]: null,
      [CardinalDirectionEnum.East]: null,
      [CardinalDirectionEnum.South]: null,
      [CardinalDirectionEnum.West]: null,
    };
    const current = nearestImage?.record;
    if (!current || !imageRecords) return map;

    const chooseCardinal = (dx: number, dy: number): CardinalDirectionEnum => {
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
          ? CardinalDirectionEnum.East
          : CardinalDirectionEnum.West;
      }
      return dy >= 0
        ? CardinalDirectionEnum.North
        : CardinalDirectionEnum.South;
    };

    // Forward candidate (same strip, increasing photoIndex)
    let forward: ObliqueImageRecord | null = null;
    let minDeltaFwd = Number.POSITIVE_INFINITY;
    imageRecords.forEach((rec) => {
      if (
        rec.lineIndex === current.lineIndex &&
        rec.cameraId === current.cameraId &&
        rec.photoIndex > current.photoIndex
      ) {
        const delta = rec.photoIndex - current.photoIndex;
        if (delta < minDeltaFwd) {
          minDeltaFwd = delta;
          forward = rec;
        }
      }
    });
    if (forward) {
      const dx = forward.centerWGS84[0] - current.centerWGS84[0];
      const dy = forward.centerWGS84[1] - current.centerWGS84[1];
      const key = chooseCardinal(dx, dy);
      map[key] = forward;
    }

    // Backward candidate (same strip, decreasing photoIndex)
    let backward: ObliqueImageRecord | null = null;
    let minDeltaBack = Number.POSITIVE_INFINITY;
    imageRecords.forEach((rec) => {
      if (
        rec.lineIndex === current.lineIndex &&
        rec.cameraId === current.cameraId &&
        rec.photoIndex < current.photoIndex
      ) {
        const delta = current.photoIndex - rec.photoIndex;
        if (delta < minDeltaBack) {
          minDeltaBack = delta;
          backward = rec;
        }
      }
    });
    if (backward) {
      const dx = backward.centerWGS84[0] - current.centerWGS84[0];
      const dy = backward.centerWGS84[1] - current.centerWGS84[1];
      const key = chooseCardinal(dx, dy);
      map[key] = backward;
    }

    // Left candidate (adjacent strip +1, same sector, <=350m)
    let leftCand: ObliqueImageRecord | null = null;
    let bestDistLeft = Number.POSITIVE_INFINITY;
    let bestDeltaIdxLeft = Number.POSITIVE_INFINITY;
    const targetLineLeft = current.lineIndex + 1;
    imageRecords.forEach((rec) => {
      if (rec.lineIndex === targetLineLeft && rec.sector === current.sector) {
        // approx meters using haversine
        const dLon = rec.centerWGS84[0] - current.centerWGS84[0];
        const dLat = rec.centerWGS84[1] - current.centerWGS84[1];
        const toRad = (v: number) => (v * Math.PI) / 180;
        const dLatR = toRad(dLat);
        const dLonR = toRad(dLon);
        const a =
          Math.sin(dLatR / 2) * Math.sin(dLatR / 2) +
          Math.cos(toRad(current.centerWGS84[1])) *
            Math.cos(toRad(rec.centerWGS84[1])) *
            Math.sin(dLonR / 2) *
            Math.sin(dLonR / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = EARTH_RADIUS_M * c;
        if (dist > 350) return;
        const deltaIdx = Math.abs(rec.photoIndex - current.photoIndex);
        if (
          dist < bestDistLeft ||
          (Math.abs(dist - bestDistLeft) < 1e-6 && deltaIdx < bestDeltaIdxLeft)
        ) {
          bestDistLeft = dist;
          bestDeltaIdxLeft = deltaIdx;
          leftCand = rec;
        }
      }
    });
    if (leftCand) {
      const dx = leftCand.centerWGS84[0] - current.centerWGS84[0];
      const dy = leftCand.centerWGS84[1] - current.centerWGS84[1];
      const key = chooseCardinal(dx, dy);
      map[key] = leftCand;
    }

    // Right candidate (adjacent strip -1, same sector, <=350m)
    let rightCand: ObliqueImageRecord | null = null;
    let bestDistRight = Number.POSITIVE_INFINITY;
    let bestDeltaIdxRight = Number.POSITIVE_INFINITY;
    const targetLineRight = current.lineIndex - 1;
    imageRecords.forEach((rec) => {
      if (rec.lineIndex === targetLineRight && rec.sector === current.sector) {
        const dLon = rec.centerWGS84[0] - current.centerWGS84[0];
        const dLat = rec.centerWGS84[1] - current.centerWGS84[1];
        const toRad = (v: number) => (v * Math.PI) / 180;
        const dLatR = toRad(dLat);
        const dLonR = toRad(dLon);
        const a =
          Math.sin(dLatR / 2) * Math.sin(dLatR / 2) +
          Math.cos(toRad(current.centerWGS84[1])) *
            Math.cos(toRad(rec.centerWGS84[1])) *
            Math.sin(dLonR / 2) *
            Math.sin(dLonR / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = EARTH_RADIUS_M * c;
        if (dist > 350) return;
        const deltaIdx = Math.abs(rec.photoIndex - current.photoIndex);
        if (
          dist < bestDistRight ||
          (Math.abs(dist - bestDistRight) < 1e-6 &&
            deltaIdx < bestDeltaIdxRight)
        ) {
          bestDistRight = dist;
          bestDeltaIdxRight = deltaIdx;
          rightCand = rec;
        }
      }
    });
    if (rightCand) {
      const dx = rightCand.centerWGS84[0] - current.centerWGS84[0];
      const dy = rightCand.centerWGS84[1] - current.centerWGS84[1];
      const key = chooseCardinal(dx, dy);
      map[key] = rightCand;
    }

    return map;
  }, [nearestImage, imageRecords]);

  const disabledDirections = useMemo(() => {
    return {
      [CardinalDirectionEnum.North]:
        !siblingsByCardinal[CardinalDirectionEnum.North],
      [CardinalDirectionEnum.East]:
        !siblingsByCardinal[CardinalDirectionEnum.East],
      [CardinalDirectionEnum.South]:
        !siblingsByCardinal[CardinalDirectionEnum.South],
      [CardinalDirectionEnum.West]:
        !siblingsByCardinal[CardinalDirectionEnum.West],
    } as Record<CardinalDirectionEnum, boolean>;
  }, [siblingsByCardinal]);

  const navigateToCardinal = useCallback(
    (dir: CardinalDirectionEnum) => {
      const candidate = siblingsByCardinal[dir];
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    [siblingsByCardinal, setNearestImage]
  );

  const navigateByFlightPattern = useCallback(
    (dir: "forward" | "backward" | "left" | "right") => {
      const current = nearestImage?.record;
      if (!current || !imageRecords) return;
      if (dir === "left" || dir === "right") {
        // Left = increasing lineIndex (South -> North), Right = decreasing lineIndex
        const targetLine =
          dir === "left" ? current.lineIndex + 1 : current.lineIndex - 1;
        let candidate: ObliqueImageRecord | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        let bestDeltaIdx = Number.POSITIVE_INFINITY;
        imageRecords.forEach((rec) => {
          if (rec.lineIndex === targetLine && rec.sector === current.sector) {
            const dist = haversineMeters(
              rec.centerWGS84[0],
              rec.centerWGS84[1],
              current.centerWGS84[0],
              current.centerWGS84[1]
            );
            if (dist > 350) return; // cap strip jump at 350m
            const deltaIdx = Math.abs(rec.photoIndex - current.photoIndex);
            if (
              dist < bestDist ||
              (Math.abs(dist - bestDist) < 1e-6 && deltaIdx < bestDeltaIdx)
            ) {
              bestDist = dist;
              bestDeltaIdx = deltaIdx;
              candidate = rec;
            }
          }
        });
        if (!candidate) return;
        setNearestImage({
          record: candidate,
          distanceOnGround: 0,
          distanceToCamera: 0,
          imageCenter: {
            x: candidate.x,
            y: candidate.y,
            longitude: candidate.centerWGS84[0],
            latitude: candidate.centerWGS84[1],
            cardinal: candidate.sector,
          },
        });
        setNearestImageDistance(0);
        return;
      }

      // forward/backward by waypoint index (photoIndex):
      // 1) Prefer exact next/prev index on same line and cameraId.
      // 2) If missing, allow skipping to the nearest in that direction within 350m.
      // NOTE: Per dataset, even lineIndex runs opposite. Invert step on even lines.
      const baseStep = dir === "forward" ? 1 : -1;
      const step = current.lineIndex % 2 === 0 ? -baseStep : baseStep;
      const targetIndex = current.photoIndex + step;

      let candidate: ObliqueImageRecord | null = null;
      // Pass 1: exact targetIndex
      imageRecords.forEach((rec) => {
        if (
          rec.lineIndex === current.lineIndex &&
          rec.cameraId === current.cameraId &&
          rec.photoIndex === targetIndex
        ) {
          candidate = rec;
        }
      });
      if (!candidate) {
        // Pass 2: nearest in direction within 350m
        let bestDelta = Number.POSITIVE_INFINITY;
        imageRecords.forEach((rec) => {
          if (
            rec.lineIndex !== current.lineIndex ||
            rec.cameraId !== current.cameraId
          )
            return;
          const delta = rec.photoIndex - current.photoIndex;
          if ((step > 0 && delta <= 0) || (step < 0 && delta >= 0)) return;
          const dist = haversineMeters(
            rec.centerWGS84[0],
            rec.centerWGS84[1],
            current.centerWGS84[0],
            current.centerWGS84[1]
          );
          if (dist > 350) return;
          const absDelta = Math.abs(delta);
          if (absDelta < bestDelta) {
            bestDelta = absDelta;
            candidate = rec;
          }
        });
      }
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    [nearestImage, imageRecords]
  );

  const value = {
    isObliqueMode,
    imageRecords,
    isLoading,
    isAllDataReady,
    error,
    nearestImageDistance,
    setNearestImageDistance,
    nearestImageRefresh,
    setNearestImageRefresh,
    toggleObliqueMode,
    nearestImage,
    setNearestImage,
    converter,
    previewPath,
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    exteriorOrientations,
    footprintData,
    footprintCenterpointsRBushByCardinals,
    lockFootprint,
    setLockFootprint,
    animations,
    footprintsStyle,
    imagePreviewStyle,
    siblingsByCardinal,
    disabledDirections,
    navigateToCardinal,
    navigateByFlightPattern,
    flightDirectionByLine,
    isIndexSearchInvertedForCurrentLine,
    navigateForward: () => {
      const current = nearestImage?.record;
      if (!current || !imageRecords) return;
      let candidate: ObliqueImageRecord | null = null;
      let minDelta = Number.POSITIVE_INFINITY;
      imageRecords.forEach((rec) => {
        if (
          rec.lineIndex === current.lineIndex &&
          rec.cameraId === current.cameraId &&
          rec.photoIndex > current.photoIndex
        ) {
          const delta = rec.photoIndex - current.photoIndex;
          if (delta < minDelta) {
            minDelta = delta;
            candidate = rec;
          }
        }
      });
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    navigateBackward: () => {
      const current = nearestImage?.record;
      if (!current || !imageRecords) return;
      let candidate: ObliqueImageRecord | null = null;
      let minDelta = Number.POSITIVE_INFINITY;
      imageRecords.forEach((rec) => {
        if (
          rec.lineIndex === current.lineIndex &&
          rec.cameraId === current.cameraId &&
          rec.photoIndex < current.photoIndex
        ) {
          const delta = current.photoIndex - rec.photoIndex;
          if (delta < minDelta) {
            minDelta = delta;
            candidate = rec;
          }
        }
      });
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    navigateLeft: () => {
      const current = nearestImage?.record;
      if (!current || !imageRecords) return;
      // Left = increasing lineIndex (South -> North)
      const targetLine = current.lineIndex + 1;
      let candidate: ObliqueImageRecord | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      let bestDeltaIdx = Number.POSITIVE_INFINITY;
      imageRecords.forEach((rec) => {
        if (rec.lineIndex === targetLine && rec.sector === current.sector) {
          const dist = haversineMeters(
            rec.centerWGS84[0],
            rec.centerWGS84[1],
            current.centerWGS84[0],
            current.centerWGS84[1]
          );
          if (dist > 350) return; // cap strip jump at 350m
          const deltaIdx = Math.abs(rec.photoIndex - current.photoIndex);
          if (
            dist < bestDist ||
            (Math.abs(dist - bestDist) < 1e-6 && deltaIdx < bestDeltaIdx)
          ) {
            bestDist = dist;
            bestDeltaIdx = deltaIdx;
            candidate = rec;
          }
        }
      });
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    navigateRight: () => {
      const current = nearestImage?.record;
      if (!current || !imageRecords) return;
      // Right = decreasing lineIndex (North -> South)
      const targetLine = current.lineIndex - 1;
      let candidate: ObliqueImageRecord | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      let bestDeltaIdx = Number.POSITIVE_INFINITY;
      imageRecords.forEach((rec) => {
        if (rec.lineIndex === targetLine && rec.sector === current.sector) {
          const dist = haversineMeters(
            rec.centerWGS84[0],
            rec.centerWGS84[1],
            current.centerWGS84[0],
            current.centerWGS84[1]
          );
          if (dist > 350) return; // cap strip jump at 350m
          const deltaIdx = Math.abs(rec.photoIndex - current.photoIndex);
          if (
            dist < bestDist ||
            (Math.abs(dist - bestDist) < 1e-6 && deltaIdx < bestDeltaIdx)
          ) {
            bestDist = dist;
            bestDeltaIdx = deltaIdx;
            candidate = rec;
          }
        }
      });
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
      setNearestImageDistance(0);
    },
    navigateToCardinal,
  };

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
