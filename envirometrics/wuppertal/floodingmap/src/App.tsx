import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import { version as cismapEnvirometricsVersion } from "@cismet-dev/react-cismap-envirometrics-maps/meta";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { useHashState } from "@carma-providers/hash-state";
import { ENDPOINT, isAreaTypeWithGEP } from "@carma-commons/resources";
import { getApplicationVersion } from "@carma-commons/utils";

// TODO fix collab path names
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";

import { getDegreesFromCartesian } from "@carma/cesium";

import {
  CustomViewer,
  PitchingCompass,
  selectViewerHome,
  selectViewerModels,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma/types";

import {
  FullscreenControl,
  MapFrameworkSwitcher,
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import { StateAwareChildren } from "./components/StateAwareChildren";

import versionData from "./version.json";

import useLeafletZoomControls from "./hooks/useLeafletZoomControls";
import { useFloodingmapFrameworkSwitcher } from "./hooks/useFloodingmapFrameworkSwitcher";

import config from "./config";
import { EMAIL, HOME_ZOOM } from "./config/app.config";
import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./config/cesium/cesium.config";

import "cesium/Build/Cesium/Widgets/widgets.css";

function App({ sync = false }: { sync?: boolean }) {
  const version = getApplicationVersion(versionData);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap - 2;

  const { gazData } = useGazData();
  const { updateHash } = useHashState();

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  const [searchParams] = useSearchParams();

  const initialCameraView = useCesiumInitialCameraFromSearchParams();

  const ctx = useCesiumContext();
  const { getScene, getTerrainProvider, getSurfaceProvider } = ctx;
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx, {
    fovMode: false,
  });
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  // LEAFLET related
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // CESIUM related
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const homePosition = useSelector(selectViewerHome);

  // Register map frameworks with switcher
  const frameworkOptions = useMemo(() => {
    const leafletMap = routedMap?.leafletMap?.leafletElement;
    const cesiumScene = getScene();
    const cesiumContainer = container3dMapRef.current;
    const terrainProvider = getTerrainProvider();
    const surfaceProvider = getSurfaceProvider();

    console.log("[FLOODINGMAP] Framework options check:", {
      hasLeafletMap: !!leafletMap,
      hasCesiumScene: !!cesiumScene,
      hasCesiumContainer: !!cesiumContainer,
      hasRoutedMap: !!routedMap,
    });

    if (!leafletMap || !cesiumScene || !cesiumContainer) {
      return null;
    }

    return {
      leafletMap,
      cesiumScene,
      cesiumContainer,
      terrainProviders: {
        TERRAIN: terrainProvider ?? null,
        SURFACE: surfaceProvider ?? null,
      },
    };
  }, [routedMap, getScene, getTerrainProvider, getSurfaceProvider]);

  useRegisterMapFramework(frameworkOptions);

  const homeCenter = useMemo(() => {
    if (!homePosition) {
      return null;
    }
    const { longitude, latitude } = getDegreesFromCartesian(homePosition);
    const center = [latitude, longitude];

    return center;
  }, [homePosition]);

  const { isCesium, setActiveFrameworkCesium, isLeaflet, getIsCesium } =
    useMapFrameworkSwitcherContext();

  const models = useSelector(selectViewerModels);

  // transitions (portals hook integrates with TopicMapContext + Redux)
  // todo wire up MapFrameworkSwitcher to this hook see geoportal example
  // const { transitionToMode2d, transitionToMode3d } = useMapFrameworkSwitcher();

  const markerAsset = models![CESIUM_CONFIG.markerKey!];
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;

  // selection handling
  const { setSelection } = useSelection();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      //console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaTypeWithGEP(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  const homeControlLeaflet = () => {
    if (homeCenter && routedMap?.leafletMap?.leafletElement) {
      //console.debug("topicMapHomeClick", homeCenter, homePosition);
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, HOME_ZOOM);
    }
  };

  const onHomeClick = () => {
    homeControl();
    homeControlLeaflet();
  };

  const onCesiumSceneChange = (e) => {
    if (isCesium) {
      updateHash(e.hashParams, {
        clearKeys: ["zoom"],
        label: "app/hgk:3D",
        replace: true,
      });
    }
  };

  useSelectionTopicMap();
  useSelectionCesium(
    getIsCesium,
    useMemo(
      () => ({
        markerAsset,
        markerAnchorHeight,
        isPrimaryStyle: true,
        withTerrainProvider: (cb) => ctx.withTerrainProvider(cb),
        withSurfaceProvider: (cb) => ctx.withSurfaceProvider(cb),
      }),
      [markerAsset, markerAnchorHeight, ctx]
    )
  );

  // Register framework switcher callbacks
  useFloodingmapFrameworkSwitcher();

  useEffect(() => {
    if (searchParams.has("is3d")) {
      const is3d = searchParams.get("is3d") === "1";
      is3d && setActiveFrameworkCesium();
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctx.withViewer((viewer) => {
      // remove default cesium credit because no ion resource is used
      (
        viewer as unknown as {
          _cesiumWidget: { _creditContainer: { style: { display: string } } };
        }
      )._cesiumWidget._creditContainer.style.display = "none";
      ctx.requestRender();
    });
  }, [ctx]);

  const enableControlStateToggle = (controlState) => {
    return controlState.selectedSimulation !== 2;
  };

  const onToggleState = (toggleState, state) => {
    return state.selectedSimulation !== 2 && toggleState;
  };

  const appMenu = (
    <GenericModalApplicationMenu
      {...getCollabedHelpComponentConfig({
        version,
        versionString: version,
        reactCismapRHMVersion: reactCismapEnvirometricsVersion,
        email: EMAIL,
      })}
    />
  );

  if (initialCameraView === null) {
    // viewer from URL not yet evaluated, don't render anything yet
    return null;
  }

  return (
    <div className="fixed w-full h-full">
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "45px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              {/* <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right"> */}
              <ControlButtonStyler
                onClick={isLeaflet ? zoomInLeaflet : handleZoomInCesium}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Maßstab vergrößern (Zoom in)"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              {/* <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right"> */}
              <ControlButtonStyler
                onClick={isLeaflet ? zoomOutLeaflet : handleZoomOutCesium}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
                title="Maßstab verkleinern (Zoom out)"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
            </div>
          </Control>
          <Control position="topleft" order={30}>
            <div className="flex flex-col">
              {/* <Tooltip title="Nach Norden ausrichten" placement="right"> */}
              <ControlButtonStyler
                useDisabledStyle={false}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                disabled={isLeaflet}
                //ref={tourRefLabels.alignNorth}
                dataTestId="compass-control"
                title="Nach Norden ausrichten"
              >
                <PitchingCompass />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              <MapFrameworkSwitcher nativeTooltip={true} />
            </div>
          </Control>
          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60}>
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={isCesium}
              nativeTooltip={true}
            />
          </Control>

          <Control position="topleft" order={70}>
            {/* <Tooltip
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
              placement="right"
            > */}
            <ControlButtonStyler
              onClick={onHomeClick}
              dataTestId="home-control"
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </ControlButtonStyler>
            {/* </Tooltip> */}
          </Control>
          <Control position="bottomleft" order={10}>
            <div className="pl-1">
              <LibFuzzySearch
                gazData={gazData}
                //referenceSystem={referenceSystem}
                //referenceSystemDefinition={referenceSystemDefinition}
                pixelwidth={pixelwidth}
                onSelection={onGazetteerSelection}
                placeholder="Stadtteil | Adresse | POI | GEP"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>

      <div
        className={
          isLeaflet
            ? "envirometricmap-container isMode2d"
            : "envirometricmap-container isMode3d"
        }
      >
        <EnviroMetricMap
          appMenu={appMenu}
          applicationMenuTooltipString="Anleitung | Hintergrund"
          initialState={config.initialState}
          emailaddress="hochwasser@stadt.wuppertal.de"
          config={config.config}
          contactButtonEnabled={false}
          homeZoom={HOME_ZOOM}
          homeCenter={homeCenter}
          modeSwitcherTitle="Hochwassergefahrenkarte Wuppertal"
          documentTitle="Hochwassergefahrenkarte Wuppertal"
          gazData={gazData}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
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
      </div>
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
        }}
      >
        <CustomViewer
          containerRef={container3dMapRef}
          cameraLimiterOptions={CESIUM_CONFIG.camera}
          initialCameraView={initialCameraView}
          constructorOptions={CONSTRUCTOR_OPTIONS}
          enableSceneStyles={false}
          onSceneChange={onCesiumSceneChange}
        ></CustomViewer>
      </div>
    </div>
  );
}

export default App;
