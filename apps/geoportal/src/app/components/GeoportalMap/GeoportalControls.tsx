import { useCallback, useState, type MutableRefObject } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";
import { Tooltip } from "antd";
import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import type { MaplibreMap } from "@carma-mapping/engines/maplibre";

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
import { useHomeControl } from "@carma-mapping/engines/cesium/core";
import type { SearchResultItem } from "@carma/types";
import {
  useGazData,
  useSelection,
  SelectionMetaData,
  SelectionMapMode,
  type SelectionItem,
  type MapEngine,
  usePortalZoomControls,
} from "@carma-appframeworks/portals";
import { isAreaType } from "@carma/resources";
import { EngineAvailability, isFeatureDisabled } from "../../utils/mapEngineAvailability";

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
import { getUIMode, toggleUIMode, UIMode } from "../../store/slices/ui.ts";

interface GeoportalControlsProps {
  isMode2d: boolean;
  currentEngine: MapEngine;
  allow3d: boolean;
  showLibreMap: boolean;
  libreMapRef: MutableRefObject<MaplibreMap | null>;
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  isSuspendedRef: React.RefObject<boolean>;
  configSelection: SelectionItem | undefined;
  responsiveState: string;
  gap: number;
  windowSize: { width: number; height: number };
}

export const GeoportalControls = ({
  isMode2d,
  currentEngine,
  allow3d,
  showLibreMap,
  libreMapRef,
  leafletMapRef,
  isSuspendedRef,
  configSelection,
  responsiveState,
  gap,
  windowSize,
}: GeoportalControlsProps) => {
  const dispatch = useDispatch();
  const homeControl = useHomeControl();
  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { setSelection } = useSelection();
  const { handleZoomIn, handleZoomOut } = usePortalZoomControls({ libreMapRef });

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

  const handleHomeClick = useCallback(() => {
    if (showLibreMap) {
      if (libreMapRef.current) {
        libreMapRef.current.flyTo({
          center: [7.199918031692506, 51.272570027476256],
          zoom: 17,
          essential: true,
        });
      }
    } else {
      const map = leafletMapRef.current;
      if (map) {
        map.flyTo([51.272570027476256, 7.199918031692506], 18);
        homeControl();
      }
    }
  }, [showLibreMap, libreMapRef, leafletMapRef, homeControl]);

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
        disabled={isFeatureDisabled(currentEngine, EngineAvailability.LEAFLET_2D) || (isMode2d && showLibreMap)}
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
            disabled={isFeatureDisabled(currentEngine, EngineAvailability.LEAFLET_2D)}
            useDisabledStyle={isFeatureDisabled(currentEngine, EngineAvailability.LEAFLET_2D)}
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
            selection={configSelection}
          />
        </div>
      </Control>
    </>
  );
};
