import L from "leaflet";
import proj4 from "proj4";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import {
  faArrowRightFromBracket,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

import type { LeafletConfig } from "@carma/types";
import {
  SelectionItem,
  TopicMapSelectionContent,
  useGazData,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { getApplicationVersion } from "@carma-commons/utils";
import { useOverlayTourContext } from "@carma-commons/ui/helper-overlay";

import { selectViewerIsMode2d } from "@carma-mapping/engines/cesium";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { useAuth } from "@carma-providers/auth";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import PrintPreview from "../../../map-print/PrintPreview.tsx";
import FeatureInfoBox from "../../../feature-info/FeatureInfoBox.tsx";
import InfoBoxMeasurement from "../../../map-measure/InfoBoxMeasurement.jsx";
import LoginForm from "../../../LoginForm.tsx";

import versionData from "../../../../../version.json";

import {
  proj4crs3857def,
  proj4crs4326def,
} from "../../../../helper/gisHelper.js";
import { useLeafletZoomControls } from "../../../../hooks/leaflet/useLeafletZoomControls.ts";
import { LEAFLET_CONFIG } from "../../../../config/app.config";
import { UIMode, getUIMode } from "../../../../store/slices/ui.ts";
import {
  getLayers,
  getLayersIdle,
  getBackgroundLayer,
  getShowHamburgerMenu,
} from "../../../../store/slices/mapping.ts";
import {
  getLoading,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../../store/slices/features.ts";
import { getBackgroundLayers } from "../../../../helper/layer.tsx";
import { useCreateCismapLayers } from "./hooks/useCreateCismapLayer.ts";
import store from "../../../../store/index.ts";
import { onClickTopicMap } from "../../topicmap.utils.ts";

type TopicMapComponentWrapperProps = {
  height: number;
  width: number;
  locationChangedHandler: (e: {
    lat: number;
    lng: number;
    zoom: number;
  }) => void;
  leafletOptions?: Partial<LeafletConfig>;
};

export function TopicMapComponentWrapper({
  height,
  width,
  locationChangedHandler,
  leafletOptions,
}: TopicMapComponentWrapperProps) {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const layersIdle = useSelector(getLayersIdle);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);
  const isMode2d = useSelector(selectViewerIsMode2d);
  const flags = useFeatureFlags();
  const { jwt, setJWT } = useAuth();
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();
  const version = getApplicationVersion(versionData);
  const { getLeafletZoom } = useLeafletZoomControls();
  const { gazData } = useGazData();
  const { routedMapRef: topicMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getTopicMap = useCallback(
    () => topicMap?.leafletMap?.leafletElement as L.Map | undefined,
    [topicMap]
  );

  const [marker, setMarker] = useState<L.Marker | undefined>();
  const [markerAccent, setMarkerAccent] = useState<L.Marker | undefined>();
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);

  const handleOnClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const map = getTopicMap();
      if (!map) return;

      if (uiMode === UIMode.FEATURE_INFO) {
        if (marker) map.removeLayer(marker);
        if (markerAccent) map.removeLayer(markerAccent);

        map.getPane("markerPaneWithBlendModeDifference").style.zIndex = "601";
        setMarkerAccent(
          L.marker([e.latlng.lat, e.latlng.lng], {
            icon: L.divIcon({
              className: "custom-marker",
              html: `
                <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 1;">
                  <div style="position: absolute; width: 20px; height: 20px; border: 2px solid black; border-radius: 50%;"></div>
                  <div style="position: absolute; width: 20000px; height: 1px; background-color: black; right: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 20000px; height: 1px; background-color: black; left: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 1px; height: 20000px; background-color: black; top: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 1px; height: 20000px; background-color: black; bottom: 18px; opacity: 0.5;"></div>
                </div>
              `,
              iconSize: [30, 30],
            }),
          }).addTo(map)
        );
        setMarker(
          L.marker([e.latlng.lat, e.latlng.lng], {
            pane: "markerPaneWithBlendModeDifference",
            icon: L.divIcon({
              className: "custom-marker",
              html: `
                <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <div style="position: absolute; width: 6px; height: 6px; background-color: yellow; border-radius: 50%;"></div>
                </div>
              `,
              iconSize: [30, 30],
            }),
          }).addTo(map)
        );

        setPos([e.latlng.lat, e.latlng.lng]);
      }

      // Query layers via helper
      onClickTopicMap(e, {
        dispatch,
        mode: uiMode,
        store,
        zoom: getLeafletZoom(),
        map,
      });
    },
    [uiMode, marker, markerAccent, getTopicMap, getLeafletZoom, dispatch]
  );

  const onComplete = useCallback(
    (selection: SelectionItem) => {
      if (layers.filter((l) => l.layerType === "vector").length === 0) return;
      if (
        (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
        !isAreaType(selection.type as ENDPOINT) &&
        isMode2d
      ) {
        const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);
        if (layersIdle) {
          const map = getTopicMap();
          const updatedPos: L.LatLngLiteral = {
            lat: selectedPos[1],
            lng: selectedPos[0],
          };
          const latlngPoint = L.latLng(updatedPos);
          if (map) {
            const evt = {
              latlng: latlngPoint,
              layerPoint: map.latLngToLayerPoint(latlngPoint),
              containerPoint: map.latLngToContainerPoint(latlngPoint),
            } as unknown as L.LeafletMouseEvent;
            map.fireEvent("click", evt);
          }
        } else {
          setTimeout(() => {
            onComplete(selection);
          }, 20);
        }
      }
    },
    [layers, uiMode, isMode2d, layersIdle, getTopicMap]
  );

  useSelectionTopicMap({ onComplete });

  const updateFeatureInfoLeaflet = useCallback(() => {
    setShouldUpdateFeatureInfo(false);
    if (!pos) return;

    setTimeout(() => {
      const latlngPoint = L.latLng(pos);
      const map = getTopicMap();
      if (map) {
        const evt = {
          latlng: latlngPoint,
          layerPoint: map.latLngToLayerPoint(latlngPoint),
          containerPoint: map.latLngToContainerPoint(latlngPoint),
        } as unknown as L.LeafletMouseEvent;
        map.fireEvent("click", evt);
      }
    }, 150);
  }, [pos, getTopicMap]);

  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;

  useEffect(() => {
    if (isModeFeatureInfo && pos) updateFeatureInfoLeaflet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  useEffect(() => {
    if (shouldUpdateFeatureInfo) {
      updateFeatureInfoLeaflet();
    }
  }, [shouldUpdateFeatureInfo, updateFeatureInfoLeaflet]);

  // Clear markers and feature state when leaving feature info mode
  useEffect(() => {
    const map = getTopicMap();
    if (uiMode !== UIMode.FEATURE_INFO && marker && map) {
      map.removeLayer(marker);
      if (markerAccent) map.removeLayer(markerAccent);
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode, marker, markerAccent, dispatch, getTopicMap]);

  const topicMapLayersElement = useCreateCismapLayers(layers, {
    mode: uiMode,
    dispatch,
    zoom: getLeafletZoom(),
    selectedFeature,
    leafletMap: getTopicMap(),
  });

  const backgroundLayerElement = useMemo(() => {
    return (
      backgroundLayer &&
      backgroundLayer.visible &&
      getBackgroundLayers({
        layerString: backgroundLayer.layers,
        masterOpacity: backgroundLayer.opacity,
      })
    );
  }, [backgroundLayer]);

  const showOverlayFromOutside = useCallback(
    (key: string) => {
      setAppMenuVisible(false);
      setSecondaryWithKey(key);
      showOverlayHandler();
    },
    [setAppMenuVisible, setSecondaryWithKey, showOverlayHandler]
  );

  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);
  const modalMenu = useMemo(
    () => (
      <GenericModalApplicationMenu
        {...getCollabedHelpComponentConfig({
          versionString: version,
          showOverlayFromOutside,
          loginFormToggle: () => setIsLoginFormVisible(!isLoginFormVisible),
          isLoginFormVisible,
          loginForm: (
            <LoginForm
              onSuccess={() => {
                setIsLoginFormVisible(false);
                setAppMenuVisible(false);
              }}
              closeLoginForm={() => setIsLoginFormVisible(false)}
            />
          ),
          loginFormTrigger: (
            <Tooltip title={jwt ? "Abmeldung" : "Anmeldung"} zIndex={99999999}>
              <Button
                type="text"
                onClick={() =>
                  jwt
                    ? setJWT(null)
                    : setIsLoginFormVisible(!isLoginFormVisible)
                }
              >
                <FontAwesomeIcon
                  icon={jwt ? faArrowRightFromBracket : faKey}
                  size="lg"
                />
              </Button>
            </Tooltip>
          ),
        })}
      />
    ),
    [
      version,
      showOverlayFromOutside,
      isLoginFormVisible,
      jwt,
      setJWT,
      setAppMenuVisible,
    ]
  );

  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const infoBox = useMemo(() => {
    if (isMode2d) {
      if (isModeMeasurement) return <InfoBoxMeasurement key={uiMode} />;
      if (selectedFeature || loadingFeatureInfo)
        return <FeatureInfoBox pos={pos} />;
    } else if (flags.featureFlagBugaBridge && selectedFeature) {
      return <FeatureInfoBox />;
    }
    return <div></div>;
  }, [
    isMode2d,
    isModeMeasurement,
    selectedFeature,
    loadingFeatureInfo,
    pos,
    flags.featureFlagBugaBridge,
    uiMode,
  ]);

  useEffect(() => {
    const handleZoomEnd = () => setShouldUpdateFeatureInfo(true);
    const map = getTopicMap();
    if (!map) return;
    map.on("zoomend", handleZoomEnd);
    return () => {
      const m = getTopicMap();
      if (!m) return;
      m.off("zoomend", handleZoomEnd);
    };
  }, [getTopicMap]);

  return (
    <div className={"map-container-2d"} style={{ zIndex: 400 }}>
      <TopicMapComponent
        gazData={gazData}
        modalMenu={modalMenu}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={tooltipText}
        hamburgerMenu={showHamburgerMenu}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        mapStyle={{
          width: width,
          height: height,
          touchAction: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "none",
        }}
        leafletMapProps={{ editable: true }}
        minZoom={10}
        backgroundlayers="empty"
        mappingBoundsChanged={() => {}}
        locationChangedHandler={locationChangedHandler}
        outerLocationChangedHandlerExclusive={true}
        onclick={handleOnClick}
        gazetteerSearchControl={true}
        infoBox={infoBox}
        zoomSnap={leafletOptions?.zoomSnap ?? LEAFLET_CONFIG.zoomSnap}
        zoomDelta={leafletOptions?.zoomDelta ?? LEAFLET_CONFIG.zoomDelta}
      >
        <TopicMapSelectionContent />
        {backgroundLayerElement}
        {topicMapLayersElement}
        <PrintPreview />
      </TopicMapComponent>
    </div>
  );
}

export default TopicMapComponentWrapper;
