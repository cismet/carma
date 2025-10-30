import { useCallback, useContext, useState, useEffect } from "react";
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
  useActiveEngines,
  usePortalContext,
  useTransitionContext,
} from "@carma-appframeworks/portals";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapLibreContext } from "@carma-mapping/engines/maplibre";
import { useFeatureFlags } from "@carma/providers/feature-flag";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { isAreaType } from "@carma/resources";
import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";
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
  const {
    setSelection,
    selection: configSelection,
    setOverlayFeature,
  } = useSelection();

  // Get TopicMap context for direct map access
  const carmaTopicMapCtx = useCarmaTopicMapContext();
  const { getRoutedMapRef, getReferenceSystem, getReferenceSystemDefinition } =
    carmaTopicMapCtx;

  // Get current mode from TransitionContext (single source of truth)
  const { currentMode } = useTransitionContext();
  const isMode2d = currentMode === "2d";
  
  // Also get engines for other purposes
  const { activeEngines } = useActiveEngines();
  const currentEngine =
    activeEngines.length > 0 ? activeEngines[0].engine : "leaflet2d";
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

  // Get engines and transition context for coordination
  const { getEngines } = usePortalContext();
  const { onCesiumFadeInRef } = useTransitionContext();

  // Register fade-in callback with TransitionContext
  // (mode syncing is now automatic via TransitionContext)
  useEffect(() => {
    onCesiumFadeInRef.current = () => {
      const engines = getEngines();
      const cesiumEngine = engines.find((e) => e.engine === "cesium3d");
      if (cesiumEngine && "triggerFadeIn" in cesiumEngine && typeof cesiumEngine.triggerFadeIn === "function") {
        cesiumEngine.triggerFadeIn();
      }
    };
  }, [getEngines, onCesiumFadeInRef]);

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

  // React to mode changes - enable/disable pointer events on Cesium canvas
  useEffect(() => {
    console.log("[GeoportalControls] Mode changed to:", currentMode);
    
    // Get Cesium container from engine record
    const engines = getEngines();
    const cesiumEngine = engines.find((e) => e.engine === "cesium3d");
    const cesiumContainer = cesiumEngine?.getContainer?.() as HTMLElement | null;
    
    if (cesiumContainer) {
      cesiumContainer.style.pointerEvents = currentMode === "3d" ? "auto" : "none";
      console.log(`[GeoportalControls] Cesium pointer events: ${currentMode === "3d" ? "enabled" : "disabled"}`);
    }
  }, [currentMode, getEngines]);

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

      // Check if this is a different selection than current
      const currentSelection = configSelection;
      const isNewItem = currentSelection?.sorter !== selection.sorter;

      if (isNewItem) {
        // New item - set selection to trigger feature info
        const selectionMetaData: SelectionMetaData = {
          selectedFrom: "gazetteer",
          selectedFromMapMode: SelectionMapMode.MODE_2D,
          selectionTimestamp: Date.now(), // Keep timestamp for NEW_SELECTION_TIMEOUT logic
          isAreaSelection: isAreaType(selection.type),
        };
        console.log("[onGazetteerSelection] New item, setting selection");
        setSelection(Object.assign({}, selection, selectionMetaData));
      } else {
        // Same item - recenter directly without changing selection state
        console.log("[onGazetteerSelection] Same item, recentering directly");

        const routedMapRef = getRoutedMapRef();
        const { leafletElement } = routedMapRef?.current?.leafletMap;

        if (leafletElement) {
          // Create selection metadata for the gazetteer trigger
          const selectionMetaData: SelectionMetaData = {
            selectedFrom: "gazetteer",
            selectedFromMapMode: SelectionMapMode.MODE_2D,
            selectionTimestamp: currentSelection?.selectionTimestamp || null,
            isAreaSelection: isAreaType(selection.type),
          };

          const fullSelection = Object.assign({}, selection, selectionMetaData);

          // Trigger recentering directly without feature info
          builtInGazetteerHitTrigger(
            [fullSelection],
            leafletElement,
            getReferenceSystem(),
            getReferenceSystemDefinition(),
            () => {}, // No setGazetteerHit callback
            setOverlayFeature,
            undefined // No furtherGazeteerHitTrigger callback (no feature info)
          );
        } else {
          console.log(
            "[onGazetteerSelection] No map available for recentering"
          );
        }
      }
    },
    [
      setSelection,
      configSelection,
      getRoutedMapRef,
      getReferenceSystem,
      getReferenceSystemDefinition,
      setOverlayFeature,
    ]
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
