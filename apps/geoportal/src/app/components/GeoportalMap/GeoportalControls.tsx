import { useCallback, useContext, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";
import { Tooltip } from "antd";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faInfo,
  faMountainCity,
} from "@fortawesome/free-solid-svg-icons";

import {
  MapTypeSwitcher,
  FullscreenControl,
  RoutedMapLocateControl,
  UnifiedZoomControl,
  UnifiedCompassControl,
} from "@carma-mapping/components";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { MeasurementControl } from "@carma-commons/measurements";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import type { SearchResultItem } from "@carma/types";
import {
  useGazData,
  useSelection,
  SelectionMetaData,
  SelectionMapMode,
  usePortalHomeControl,
  usePortalZoomControls,
} from "@carma-appframeworks/portals";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapLibreContext } from "@carma-mapping/engines/maplibre";
import { useFeatureFlags } from "@carma/providers/feature-flag";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { isAreaType } from "@carma/resources";
import {
  EngineAvailability,
  isFeatureDisabled,
} from "../../utils/mapEngineAvailability";

import LayerWrapper from "../layers/LayerWrapper.tsx";
import { useTourRefCollabLabels } from "../../hooks/useTourRefCollabLabels.ts";
import { cancelOngoingRequests } from "./topicmap.utils.ts";
import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getShowFullscreenButton,
  getShowLocatorButton,
} from "../../store/slices/mapping.ts";
import {
  getUIAllow3d,
  getUIMode,
  toggleUIMode,
  UIMode,
} from "../../store/slices/ui.ts";

// No props needed - fetch from contexts
export const GeoportalControls = () => {
  const dispatch = useDispatch();
  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { setSelection, selection: configSelection } = useSelection();

  // Fetch from contexts instead of props
  const { current: currentEngine } = usePortalMapEngine();
  const isMode2d = currentEngine === "leaflet2d";
  const { isSuspendedRef } = useCesiumContext();
  const { mapRef: libreMapRef } = useMapLibreContext(); // Get MapLibre ref from context
  const flags = useFeatureFlags();
  const showLibreMap = flags.featureFlagLibreMap;
  const allow3d = useSelector(getUIAllow3d); // hasGPU check happens in parent

  // Responsive context
  const contextValue = useContext(ResponsiveTopicMapContext) as any;
  const { responsiveState, gap, windowSize } = contextValue ?? {};

  // Get Portal's handleHome - it coordinates across all engines
  const { handleHome } = usePortalHomeControl();

  // Portal handles all zoom routing internally via engine contexts
  const { handleZoomIn, handleZoomOut } = usePortalZoomControls();

  // Home button calls Portal's handleHome
  // Portal routes to active engine's flyHome callback (no hash needed if already at home)
  const handleHomeClick = useCallback(() => {
    console.log("[GeoportalControls] Home button clicked");
    handleHome(); // Portal routes to active engine's flyHome callback
  }, [handleHome]);

  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);

  const [showTerrain, setShowTerrain] = useState(false);

  const handleToggleFeatureInfo = useCallback(() => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  }, [dispatch]);

  const onGazetteerSelection = useCallback(
    (selection: SearchResultItem) => {
      if (!selection) {
        console.debug("onGazetteerSelection", selection);
        setSelection(null);
        return;
      }
      const selectionMetaData: SelectionMetaData = {
        selectedFrom: "gazetteer",
        selectedFromMapMode: isSuspendedRef.current
          ? SelectionMapMode.MODE_2D
          : SelectionMapMode.MODE_3D,
        selectionTimestamp: Date.now(),
        isAreaSelection: isAreaType(selection.type),
      };

      setSelection(Object.assign({}, selection, selectionMetaData));
    },
    [setSelection, isSuspendedRef]
  );

  const handleFeatureInfoClick = useCallback(() => {
    handleToggleFeatureInfo();
    dispatch(setSelectedFeature(null));
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(setFeatures([]));
    dispatch(setPreferredLayerId(""));
  }, [handleToggleFeatureInfo, dispatch]);

  return (
    <>
      <Control position="topleft" order={10}>
        <UnifiedZoomControl
          tourRef={tourRefLabels.zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      </Control>
      {allow3d && (
        <Control position="topleft" order={10}>
          <div className="flex flex-col">
            <UnifiedCompassControl
              tourRef={tourRefLabels.alignNorth}
              isMode2d={isMode2d}
              showLibreMap={showLibreMap}
              libreMapRef={libreMapRef}
              disabled={isMode2d && !showLibreMap}
            />
            <MapTypeSwitcher
              className="!rounded-t-none !border-t-[1px]"
              ref={tourRefLabels.toggle2d3d}
            />
            {
              // TODO implement cesium home action with generic home control for all mapping engines
            }
          </div>
        </Control>
      )}
      <Control position="topleft" order={20}>
        {showFullscreenButton && (
          <FullscreenControl tourRef={tourRefLabels?.fullScreen} />
        )}
      </Control>
      {showLocatorButton && isMobile && (
        <Control position="topleft" order={30}>
          <RoutedMapLocateControl
            tourRefLabels={tourRefLabels}
            disabled={false}
            nativeTooltip={true}
          />
        </Control>
      )}
      <Control position="topleft" order={40}>
        <Tooltip title="Auf Rathaus Barmen positionieren" placement="right">
          <ControlButtonStyler
            ref={tourRefLabels.home}
            onClick={handleHomeClick}
            dataTestId="home-control"
          >
            <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
          </ControlButtonStyler>
        </Tooltip>
      </Control>
      <MeasurementControl
        position="topleft"
        order={60}
        disabled={
          isFeatureDisabled(currentEngine, EngineAvailability.LEAFLET_2D) ||
          (isMode2d && showLibreMap)
        }
        useDisabledStyle={isMode2d && showLibreMap}
        tooltip={
          !isMode2d
            ? "zum Messen zu 2D-Modus wechseln"
            : isModeMeasurement
            ? "Messungsmodus ausschalten"
            : "Messungsmodus einschalten"
        }
        tooltipPlacement="right"
        showInfoBox={false}
      />
      <Control position="topleft" order={50}>
        <Tooltip
          title={
            isModeFeatureInfo
              ? "Modus Multi-Sachdatenabfrage ausschalten"
              : "Modus Multi-Sachdatenabfrage einschalten"
          }
          placement="right"
        >
          <ControlButtonStyler
            disabled={isFeatureDisabled(
              currentEngine,
              EngineAvailability.LEAFLET_2D
            )}
            useDisabledStyle={isFeatureDisabled(
              currentEngine,
              EngineAvailability.LEAFLET_2D
            )}
            onClick={handleFeatureInfoClick}
            className="font-semibold"
            ref={tourRefLabels.featureInfo}
            dataTestId="feature-info-control"
          >
            <FontAwesomeIcon
              icon={faInfo}
              className={isModeFeatureInfo ? "text-[#1677ff]" : ""}
            />
          </ControlButtonStyler>
        </Tooltip>
      </Control>
      {showLibreMap && (
        <Control position="topleft" order={80}>
          <Tooltip title={"Terrain"} placement="right">
            <ControlButtonStyler
              onClick={() => {
                if (libreMapRef.current?.terrain) {
                  libreMapRef.current.setTerrain(null);
                  setShowTerrain(false);
                } else {
                  libreMapRef.current?.setTerrain({
                    source: "terrainSource",
                    exaggeration: 1,
                  });
                  setShowTerrain(true);
                }
              }}
              className="font-semibold"
            >
              <FontAwesomeIcon
                icon={faMountainCity}
                className={showTerrain ? "text-[#1677ff]" : ""}
              />
            </ControlButtonStyler>
          </Tooltip>
        </Control>
      )}
      <Control position="topcenter" order={10}>
        {isMode2d && <LayerWrapper />}
      </Control>
      <Control position="bottomleft" order={10}>
        <div ref={tourRefLabels.gazetteer} className={`h-full w-full`}>
          <LibFuzzySearch
            gazData={gazData}
            onSelection={onGazetteerSelection}
            placeholder="Wohin?"
            pixelwidth={
              responsiveState === "normal" ? "300px" : windowSize.width - gap
            }
            selection={configSelection ?? undefined}
          />
        </div>
      </Control>
    </>
  );
};
