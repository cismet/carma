import React, {
  createContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { useLocation } from "react-router-dom";
import debounce from "lodash/debounce";

import type { FeatureCollection, Polygon } from "geojson";
import {
  updateHashHistoryState,
  deleteHashParamsFromHistoryState,
} from "@carma-commons/utils";

import type {
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueAnimationsConfig,
  ObliqueDataProviderConfig,
  ObliqueFootprintsStyle,
  ObliqueImagePreviewStyle,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";

import { useObliqueData } from "../hooks/useObliqueData";

import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { FootprintProperties } from "../utils/footprintUtils";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";

import { OBLIQUE_PREVIEW_QUALITY, OBLIQUE_STATE_KEYS } from "../constants";
import { createConverter } from "../utils/crsUtils";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

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
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(false);
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

  const { pathname } = useLocation();

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
      if (newMode) {
        updateHashHistoryState(
          { [OBLIQUE_STATE_KEYS.isOblique]: "1" },
          pathname
        );
      } else {
        deleteHashParamsFromHistoryState(
          [OBLIQUE_STATE_KEYS.isOblique],
          pathname
        );
      }
      return newMode;
    });
  }, [pathname, setIsObliqueMode]); // setIsObliqueMode is stable

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
      nearestImageRefresh
    ) {
      // TODO: check if this ever needed, remove if not
      nearestImageRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageRecords, isObliqueMode, nearestImageRefresh, lockFootprint]);

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
  };

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
