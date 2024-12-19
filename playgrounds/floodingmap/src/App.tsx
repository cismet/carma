import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Tooltip } from "antd";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  CheckerboardMaterialProperty,
  Color,
  Entity,
  sampleTerrain,
  sampleTerrainMostDetailed,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ShadowMode,
  StripeMaterialProperty,
  StripeOrientation,
} from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { version as cismapEnvirometricsVersion } from "@cismet-dev/react-cismap-envirometrics-maps/meta";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import {
  replaceHashRoutedHistory,
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import {
  getApplicationVersion,
  isNumberArrayEqual,
} from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";

import {
  Compass,
  CustomViewer,
  MapTypeSwitcher,
  selectViewerHome,
  selectViewerIsMode2d,
  selectViewerModels,
  useCesiumContext,
  useHomeControl,
  useZoomControls,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import NotesDisplay from "./NotesDisplay";
import versionData from "./version.json";

import { useHGKCesiumTerrain } from "./hooks/useHGKCesiumTerrain";
import useLeafletZoomControls from "./hooks/useLeafletZoomControls";

import config from "./config";
import { HGK_KEYS, HGK_TERRAIN_PROVIDER_URLS } from "./config/app.config";
import { CESIUM_CONFIG } from "./config/cesium/cesium.config";

import "cesium/Build/Cesium/Widgets/widgets.css";

// disable cesium canvas background transparency
const constructorOptions = {
  contextOptions: { webgl: { alpha: false } },
};

function App({ sync = false }: { sync?: boolean }) {
  const version = getApplicationVersion(versionData);

  const { gazData } = useGazData();

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  const email = "hochwasser@stadt.wuppertal.de";
  //const [hinweisData, setHinweisData] = useState([]);

  const homeZoom = 18;

  // CONTROLS

  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControls();
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  // LEAFLET related
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // CESIUM related

  const container3dMapRef = useRef<HTMLDivElement>(null);
  const homePosition = useSelector(selectViewerHome);

  const homeCenter = useMemo(() => {
    if (!homePosition) {
      return null;
    }
    const { latitude, longitude } = Cartographic.fromCartesian(homePosition);
    const center = [
      CesiumMath.toDegrees(latitude),
      CesiumMath.toDegrees(longitude),
    ];

    return center;
  }, [homePosition]);

  const { viewerRef, terrainProviderRef, surfaceProviderRef } =
    useCesiumContext();

  const isMode2d = useSelector(selectViewerIsMode2d);

  const models = useSelector(selectViewerModels);

  const markerAsset = models![CESIUM_CONFIG.markerKey!];
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;

  // selection handling
  const { setSelection } = useSelection();

  useSelectionTopicMap();
  useSelectionCesium(
    !isMode2d,
    useMemo(
      () => ({
        markerAsset,
        markerAnchorHeight,
        isPrimaryStyle: true,
        surfaceProviderRef,
        terrainProviderRef,
      }),
      [markerAsset, markerAnchorHeight, surfaceProviderRef, terrainProviderRef]
    )
  );

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  const homeControlLeaflet = () => {
    if (homeCenter && routedMap?.leafletMap?.leafletElement) {
      console.debug("topicMapHomeClick", homeCenter, homePosition);
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, homeZoom);
    }
  };

  const onHomeClick = () => {
    homeControl();
    homeControlLeaflet();
  };

  const onCesiumSceneChange = (e) => {
    replaceHashRoutedHistory(e, "/");
  };

  useEffect(() => {
    if (viewerRef.current) {
      const viewer = viewerRef.current;
      // remove default cesium credit because no ion resorce is used;
      (viewer as any)._cesiumWidget._creditContainer.style.display = "none";
      setTimeout(() => {
        console.debug("3d setup for HGK terrain style");
        viewer.scene.backgroundColor = Color.DIMGREY;
        viewer.scene.globe.baseColor = new Color(0.3, 0.2, 0.8, 0.7);
        viewer.scene.globe.show = true;
        viewer.scene.globe.translucency.enabled = true;
        viewer.scene.globe.translucency.frontFaceAlpha = 1.0;
        viewer.scene.globe.translucency.backFaceAlpha = 1.0;
        if (viewer.imageryLayers.length > 0) {
          console.debug("hide default imagery layer hgk");
          const imageryLayer = viewer.imageryLayers.get(0);
          imageryLayer.show = false;
        }
        viewer.scene.requestRender();
      }, 300);
    }
  }, [viewerRef]);

  const onFullscreenClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const enableControlStateToggle = (controlState) => {
    return controlState.selectedSimulation !== 2;
  };

  const onToggleState = (toggleState, state) => {
    return state.selectedSimulation !== 2 && toggleState;
  };

  const appMenu = () => {
    console.debug("Render appMenu");
    return (
      <GenericModalApplicationMenu
        {...getCollabedHelpComponentConfig({
          version,
          versionString: version,
          reactCismapRHMVersion: reactCismapEnvirometricsVersion,
          email,
        })}
      />
    );
  };

  console.debug("RENDER: HGK App");

  return (
    <>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
                <ControlButtonStyler
                  onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
                  className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                  dataTestId="zoom-in-control"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-base" />
                </ControlButtonStyler>
              </Tooltip>
              <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
                <ControlButtonStyler
                  onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
                  className="!rounded-t-none !border-t-[1px]"
                  dataTestId="zoom-out-control"
                >
                  <FontAwesomeIcon icon={faMinus} className="text-base" />
                </ControlButtonStyler>
              </Tooltip>
            </div>
          </Control>
          <Control position="topleft" order={20}>
            <ControlButtonStyler
              onClick={onFullscreenClick}
              dataTestId="full-screen-control"
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={40}>
            <ControlButtonStyler
              onClick={onHomeClick}
              dataTestId="home-control"
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={70}>
            <MapTypeSwitcher
              duration={CESIUM_CONFIG.transitions.mapMode.duration}
            />
            <Compass disabled={isMode2d} />
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full">
              <LibFuzzySearch
                gazData={gazData}
                //referenceSystem={referenceSystem}
                //referenceSystemDefinition={referenceSystemDefinition}
                onSelection={onGazetteerSelection}
                placeholder="Wohin?"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>

      <EnviroMetricMap
        appMenu={appMenu}
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={config.initialState}
        emailaddress="hochwasser@stadt.wuppertal.de"
        config={config.config}
        contactButtonEnabled={false}
        homeZoom={homeZoom}
        homeCenter={homeCenter}
        modeSwitcherTitle="Hochwassergefahrenkarte Wuppertal"
        documentTitle="Hochwassergefahrenkarte Wuppertal"
        gazData={gazData}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        gazetteerSearchControl={false}
        animationEnabled={false}
        toggleEnabled={true}
        customInfoBoxToggleState={hochwasserschutz}
        customInfoBoxToggleStateSetter={setHochwasserschutz}
        customInfoBoxDerivedToggleState={onToggleState}
        customInfoBoxDerivedToggleClickable={enableControlStateToggle}
      >
        {sync && (
          <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
        )}
        <StateAwareChildren />
        <TopicMapSelectionContent />
      </EnviroMetricMap>
      <div
        ref={container3dMapRef}
        className={"map-container-3d"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 400,
          opacity: isMode2d ? 0 : 1,
          transition: `opacity ${CESIUM_CONFIG.transitions.mapMode.duration}ms ease-in-out`,
          pointerEvents: isMode2d ? "none" : "auto",
        }}
      >
        <CustomViewer
          containerRef={container3dMapRef}
          cameraOptions={CESIUM_CONFIG.camera}
          constructorOptions={constructorOptions}
          enableSceneStyles={false}
          onSceneChange={onCesiumSceneChange}
        ></CustomViewer>
      </div>
    </>
  );
}
const StateAwareChildren = () => {
  // ENVIROMETRICMAP
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { executeFeatureInfoRequest } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);

  const isHWS = controlState.customInfoBoxToggleState;

  const conf = config.config;

  // CESIUM
  const { viewerRef, terrainProviderRef } = useCesiumContext();
  const [cesiumPickedPosition, setCesiumPickedPosition] = useState<
    [number, number] | null
  >(null);
  const markerEntityRef = useRef<Entity | null>(null);

  const prevPositionRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (viewerRef.current && controlState.featureInfoModeActivated) {
      const viewer = viewerRef.current;

      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(async (click) => {
        const cartesian = viewer.scene.pickPosition(click.position);
        if (cartesian && terrainProviderRef.current) {
          const cartographic = Cartographic.fromCartesian(cartesian);
          const lat = CesiumMath.toDegrees(cartographic.latitude);
          const lon = CesiumMath.toDegrees(cartographic.longitude);
          const [groundPositionCartographic] = await sampleTerrainMostDetailed(
            terrainProviderRef.current,
            [cartographic]
          );
          const groundPositionCartesian = Cartographic.toCartesian(
            groundPositionCartographic
          );

          //const height = cartographic.height;
          setCesiumPickedPosition([lat, lon]);

          // Remove existing marker if any
          if (markerEntityRef.current) {
            viewer.entities.remove(markerEntityRef.current);
          }
          const interval = 0.1; // 10 cm
          const rodHeight = 2.0;
          const rodWidth = 0.3;
          const repeats = Math.floor(rodHeight / interval);

          // Create new marker rod
          const newMarker = viewer.entities.add({
            //position: cartesian,
            position: groundPositionCartesian,
            box: {
              dimensions: new Cartesian3(rodWidth, rodWidth, rodHeight),
              /*
              material: new StripeMaterialProperty({
                orientation: StripeOrientation.HORIZONTAL,
                offset: 0.05,
                repeat: 20,
                oddColor: Color.YELLOW,
                evenColor: Color.BLACK,
              }),
              */
              material: new CheckerboardMaterialProperty({
                oddColor: Color.ORANGE,
                evenColor: Color.BLACK,
                repeat: new Cartesian2(2, repeats),
              }),
              outline: false,
              shadows: ShadowMode.CAST_ONLY,
            },
          });
          markerEntityRef.current = newMarker;
        }
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        handler.destroy();
        setCesiumPickedPosition(null);
        if (markerEntityRef.current) {
          viewer.entities.remove(markerEntityRef.current);
          viewer.scene.requestRender();
          markerEntityRef.current = null;
        }
      };
    }
  }, [viewerRef, controlState.featureInfoModeActivated]);

  // Add effect to cleanup marker when feature info mode is disabled
  useEffect(() => {
    if (
      !controlState.featureInfoModeActivated &&
      markerEntityRef.current &&
      viewerRef.current
    ) {
      viewerRef.current.entities.remove(markerEntityRef.current);
      markerEntityRef.current = null;
      setCesiumPickedPosition(null);
    }
  }, [viewerRef, controlState.featureInfoModeActivated]);

  useEffect(() => {
    if (
      controlState.featureInfoModeActivated &&
      cesiumPickedPosition &&
      (!prevPositionRef.current ||
        !isNumberArrayEqual(prevPositionRef.current, cesiumPickedPosition))
    ) {
      console.debug(
        "cesium picked position changed",
        controlState,
        cesiumPickedPosition,
        executeFeatureInfoRequest
      );
      prevPositionRef.current = cesiumPickedPosition;

      executeFeatureInfoRequest({
        lat: cesiumPickedPosition[0],
        lng: cesiumPickedPosition[1],
      });
    }
  }, [cesiumPickedPosition, controlState.featureInfoModeActivated]);

  useHGKCesiumTerrain(
    controlState.selectedSimulation,
    isHWS,
    HGK_KEYS,
    HGK_TERRAIN_PROVIDER_URLS
  );

  console.debug("RENDER: StateAwareChildren");

  return (
    <>
      {isHWS && controlState.selectedSimulation !== 2 && <NotesDisplay />}
      {!isHWS &&
        conf.simulations[controlState.selectedSimulation].gefaehrdungsLayer && (
          <StyledWMSTileLayer
            key={
              "rainHazardMap.depthLayer" +
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer +
              "." +
              controlState.selectedBackground
            }
            url={conf.modelWMS}
            layers={
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer
            }
            version="1.1.1"
            transparent="true"
            format="image/png"
            tiled={true}
            styles={
              conf.simulations[controlState.selectedSimulation].depthStyle
            }
            maxZoom={22}
            opacity={0.8}
          />
        )}
    </>
  );
};

export default App;
