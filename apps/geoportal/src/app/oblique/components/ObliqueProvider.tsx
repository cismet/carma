import React, {
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import debounce from "lodash/debounce";

import { useSelection } from "@carma-appframeworks/portals";

import { useHashState } from "@carma-providers/hash-state";

import { ObliqueContext } from "../context/ObliqueContext";
import type {
  NearestObliqueImageRecord,
  ObliqueDataProviderConfig,
} from "../types";

import { useObliqueData } from "../hooks/useObliqueData";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import type { CardinalDirectionEnum } from "../utils/orientationUtils";

import { createConverter } from "../utils/crsUtils";
import { prefetchSiblingPreviewFor } from "../utils/prefetch";
import { useKnownSiblings } from "../hooks/useKnownSiblings";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

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
  const { isRuntimeReady, requestRender } = useCesiumContext();
  const { selectionFlyToCameraHeightRef } = useSelection();
  const { updateHashState, getHashStateValues } = useHashState();
  // Read initial oblique mode from hash only once on mount
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(() => {
    const { isOblique } = getHashStateValues();
    return isOblique === "1";
  });
  const [lockFootprint, setLockFootprint] = useState(false);
  const [suspendSelectionSearch, setSuspendSelectionSearch] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const selectedImageDistanceRef = useRef<number | null>(null);

  const setPreviewVisible = useCallback((visible: boolean) => {
    setIsPreviewVisible(visible);
  }, []);

  const {
    exteriorOrientationsURI,
    footprintsURI,
    crs,
    previewPath,
    previewQualityLevel,
    downloadQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    targetEnterObliqueModeFov,
    restoreFovOnLeave,
    headingOffset,
    animations,
    footprintsStyle,
    imagePreviewStyle,
  } = config;

  useEffect(() => {
    selectionFlyToCameraHeightRef.current = isObliqueMode ? fixedHeight : null;
    return () => {
      selectionFlyToCameraHeightRef.current = null;
    };
  }, [fixedHeight, isObliqueMode, selectionFlyToCameraHeightRef]);

  useEffect(() => {
    if (!isObliqueMode && isPreviewVisible) {
      setIsPreviewVisible(false);
    }
  }, [isObliqueMode, isPreviewVisible]);

  useEffect(() => {
    return () => {
      setIsPreviewVisible(false);
    };
  }, []);

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

  const knownSiblingIds = useKnownSiblings(imageRecords, selectedImage);

  // Allows one-shot override of camera heading for nearest-image search flows
  const requestedHeadingRef = useRef<number | null>(null);

  const performToggleAction = useCallback(() => {
    setIsObliqueMode((prevMode: boolean) => {
      const newMode = !prevMode;
      updateHashState?.({ isOblique: newMode ? "1" : undefined });
      return newMode;
    });
  }, [setIsObliqueMode, updateHashState]);

  const toggleObliqueMode = useMemo(
    () => debounce(performToggleAction, DEBOUNCE_MS, DEBOUNCE_LEADING_EDGE),
    [performToggleAction]
  );

  const prefetchSiblingPreview = useCallback(
    (imageId: string, dir: CardinalDirectionEnum) => {
      prefetchSiblingPreviewFor(
        imageId,
        dir,
        imageRecords,
        previewPath,
        previewQualityLevel
      );
    },
    [imageRecords, previewPath, previewQualityLevel]
  );

  // Log the active image once it is determined
  useEffect(() => {
    if (selectedImage?.record?.id) {
      console.info(
        "[OBLQ|ACTIVE_IMAGE]",
        selectedImage.record.id,
        selectedImage.imageCenter || null
      );
    }
  }, [selectedImage]);

  // Once a nearest image exists and the runtime is ready, retrigger render twice (100ms apart)
  // to ensure derived visuals (e.g., footprint outline) become visible without interaction
  useEffect(() => {
    if (isObliqueMode && isRuntimeReady && selectedImage && !lockFootprint) {
      requestRender({ delay: 500, repeat: 10, repeatInterval: 200 });
    }
  }, [
    isObliqueMode,
    isRuntimeReady,
    requestRender,
    selectedImage,
    lockFootprint,
  ]);

  const value = useMemo(
    () => ({
      isObliqueMode,
      isPreviewVisible,
      setPreviewVisible,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
      toggleObliqueMode,
      selectedImage,
      setSelectedImage,
      converter,
      previewPath,
      previewQualityLevel,
      downloadQualityLevel,
      fixedPitch,
      fixedHeight,
      minFov,
      maxFov,
      targetEnterObliqueModeFov,
      restoreFovOnLeave,
      headingOffset,
      exteriorOrientations,
      footprintData,
      footprintCenterpointsRBushByCardinals,
      lockFootprint,
      setLockFootprint,
      suspendSelectionSearch,
      setSuspendSelectionSearch,
      animations,
      footprintsStyle,
      imagePreviewStyle,
      knownSiblingIds,
      prefetchSiblingPreview,
      requestedHeadingRef,
    }),
    [
      isObliqueMode,
      isPreviewVisible,
      setPreviewVisible,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
      toggleObliqueMode,
      selectedImage,
      setSelectedImage,
      converter,
      previewPath,
      previewQualityLevel,
      downloadQualityLevel,
      fixedPitch,
      fixedHeight,
      minFov,
      maxFov,
      targetEnterObliqueModeFov,
      restoreFovOnLeave,
      headingOffset,
      exteriorOrientations,
      footprintData,
      footprintCenterpointsRBushByCardinals,
      lockFootprint,
      setLockFootprint,
      suspendSelectionSearch,
      setSuspendSelectionSearch,
      animations,
      footprintsStyle,
      imagePreviewStyle,
      knownSiblingIds,
      prefetchSiblingPreview,
      requestedHeadingRef,
    ]
  );

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
