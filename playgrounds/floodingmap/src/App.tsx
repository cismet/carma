import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { MappingConstants } from "react-cismap";
import {
  Cartographic,
  Math as CesiumMath,
  CesiumTerrainProvider,
  Color,
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
import { EnviroMetricMapContext } from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { version as cismapEnvirometricsVersion } from "@cismet-dev/react-cismap-envirometrics-maps/meta";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import CrossTabCommunicationContextProvider from "react-cismap/contexts/CrossTabCommunicationContextProvider";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  Compass,
  CustomViewer,
  MapTypeSwitcher,
  selectShowPrimaryTileset,
  selectViewerHome,
  selectViewerIsMode2d,
  selectViewerModels,
  setShowPrimaryTileset,
  useCesiumContext,
  useHomeControl,
  useZoomControls,
} from "@carma-mapping/cesium-engine";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import config from "./config";

import NotesDisplay from "./NotesDisplay";
import versionData from "./version.json";

import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { useSelector } from "react-redux";

import { CESIUM_CONFIG } from "./config/cesium/cesium.config";
import useLeafletZoomControls from "./hooks/useLeafletZoomControls";

import "cesium/Build/Cesium/Widgets/widgets.css";

// TODO replace by hiding UI props for EnviroMetricMap
const envirometricMapStyleOverrides = `
  .leaflet-top { display: none !important; }
  .leaflet-bottom.leaflet-left { display: none !important; }
`;

const HGK_KEYS = Object.freeze({
  0: "HQ10-50",
  1: "HQ100",
  2: "HQ500",
});

const HGK_TERRAIN_PROVIDER_URLS = {
  "HQ10-50": "https://cesium-wupp-terrain.cismet.de/HQ10-50/",
  HQ100: "https://cesium-wupp-terrain.cismet.de/HQ100/",
  HQ500: "https://cesium-wupp-terrain.cismet.de/HQ500cm/",
};

// reuse terrain provider instances
const hgkTerrainProviders = {};

function App() {
  const version = getApplicationVersion(versionData);

  const { gazData } = useGazData();

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  const email = "hochwasser@stadt.wuppertal.de";
  const [hinweisData, setHinweisData] = useState([]);

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

  useEffect(() => {
    if (!isMode2d && viewerRef.current) {
      const viewer = viewerRef.current;
      setTimeout(() => {
        console.debug("force hide default imagery layer hgk");
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
  }, [isMode2d, viewerRef]);

  return (
    <CrossTabCommunicationContextProvider
      role="sync"
      token="floodingAndRainhazardSyncWupp"
    >
      <style>{envirometricMapStyleOverrides}</style>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              <ControlButtonStyler
                onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              <ControlButtonStyler
                onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
            </div>
          </Control>
          <Control position="topleft" order={20}>
            <ControlButtonStyler
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
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
        </ControlLayout>
        n
      </div>

      <div
        className="fuzzy-search-container"
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "10px",
          zIndex: 600,
          overflow: "hidden",
        }}
      >
        <LibFuzzySearch
          gazData={gazData}
          //referenceSystem={referenceSystem}
          //referenceSystemDefinition={referenceSystemDefinition}
          onSelection={onGazetteerSelection}
          placeholder="Wohin?"
        />
      </div>
      <EnviroMetricMap
        appMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              version,
              versionString: version,
              reactCismapRHMVersion: reactCismapEnvirometricsVersion,

              email,
            })}
          />
        }
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
        // TODO disable Leaflet builin controls
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        // TODO DISABLE GAZETTEER
        gazetteerSearchControl={false}
        animationEnabled={false}
        toggleEnabled={true}
        customInfoBoxToggleState={hochwasserschutz}
        customInfoBoxToggleStateSetter={setHochwasserschutz}
        customInfoBoxDerivedToggleState={(toggleState, state) =>
          state.selectedSimulation !== 2 && toggleState
        }
        customInfoBoxDerivedToggleClickable={(controlState) => {
          return controlState.selectedSimulation !== 2;
        }}
      >
        <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
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
          onSceneChange={() => {}} // TODO
          enableSceneStyles={false}
        ></CustomViewer>
      </div>
    </CrossTabCommunicationContextProvider>
  );
}
//x
const StateAwareChildren = () => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(EnviroMetricMapContext);
  const { terrainProviderRef, viewerRef } = useCesiumContext();

  const conf = config.config;
  const state = controlState;

  useEffect(() => {
    const hqKey = HGK_KEYS[controlState.selectedSimulation];
    console.info(
      "hqKey changed",
      hqKey,
      controlState.selectedSimulation,
      HGK_TERRAIN_PROVIDER_URLS[hqKey]
    );
    if (hqKey) {
      (async () => {
        if (!hgkTerrainProviders[hqKey]) {
          const url = HGK_TERRAIN_PROVIDER_URLS[hqKey];
          try {
            hgkTerrainProviders[hqKey] = await CesiumTerrainProvider.fromUrl(
              url
            );
          } catch (e) {
            console.error(
              "failed to create terrain provider for",
              hqKey,
              url,
              e
            );
          }
        }
        const provider = hgkTerrainProviders[hqKey];
        terrainProviderRef.current = provider;
        if (viewerRef.current && provider) {
          const viewer = viewerRef.current;
          setTimeout(() => {
            // overwrite default terrain provider
            console.debug("set HGK terrain provider for", hqKey, provider);
            viewer.scene.terrainProvider = provider;
            viewer.scene.requestRender();
          }, 500);
        }
      })();
    }
  }, [controlState.selectedSimulation, terrainProviderRef, viewerRef]);

  return (
    <>
      {controlState.customInfoBoxToggleState &&
        state.selectedSimulation !== 2 && <NotesDisplay />}
      {controlState.customInfoBoxToggleState === false &&
        conf.simulations[state.selectedSimulation].gefaehrdungsLayer && (
          <StyledWMSTileLayer
            key={
              "rainHazardMap.depthLayer" +
              conf.simulations[state.selectedSimulation].gefaehrdungsLayer +
              "." +
              state.selectedBackground
            }
            url={conf.modelWMS}
            layers={
              conf.simulations[state.selectedSimulation].gefaehrdungsLayer
            }
            version="1.1.1"
            transparent="true"
            format="image/png"
            tiled={true}
            styles={conf.simulations[state.selectedSimulation].depthStyle}
            maxZoom={22}
            opacity={0.8}
          />
        )}
    </>
  );
};

export default App;
