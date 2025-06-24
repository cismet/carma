import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
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
} from "@carma-apps/portals";
import {
  ENDPOINT,
  isAreaType,
  isAreaTypeWithGEP,
} from "@carma-commons/resources";
import {
  getApplicationVersion,
  updateHashHistoryState,
} from "@carma-commons/utils";

import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";

import {
  CustomViewer,
  getDegreesFromCartesian,
  MapTypeSwitcher,
  PitchingCompass,
  selectViewerHome,
  selectViewerIsMode2d,
  selectViewerModels,
  setIsMode2d,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
  useHomeControl,
  useZoomControls,
  VIEWERSTATE_KEYS,
} from "@carma-mapping/cesium-engine";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma-commons/types";

import {
  FullscreenControl,
  RoutedMapLocateControl,
} from "@carma-mapping/components";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import { StateAwareChildren } from "./components/StateAwareChildren";

import versionData from "./version.json";

import useLeafletZoomControls from "./hooks/useLeafletZoomControls";

import config from "./config";
import { EMAIL, HOME_ZOOM } from "./config/app.config";
import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./config/cesium/cesium.config";

import "cesium/Build/Cesium/Widgets/widgets.css";

function App({ sync = false }: { sync?: boolean }) {
  const version = getApplicationVersion(versionData);
  const dispatch = useDispatch();
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap - 2;

  const { gazData } = useGazData();

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  const [searchParams] = useSearchParams();

  const initialCameraView = useCesiumInitialCameraFromSearchParams();

  // CONTROLS
  const {
    viewerRef,
    viewerAnimationMapRef,
    isViewerReady,
    terrainProviderRef,
    surfaceProviderRef,
  } = useCesiumContext();
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControls(viewerRef, viewerAnimationMapRef);
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
    const { longitude, latitude } = getDegreesFromCartesian(homePosition);
    const center = [latitude, longitude];

    return center;
  }, [homePosition]);

  const isMode2d = useSelector(selectViewerIsMode2d);

  const models = useSelector(selectViewerModels);

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
    isMode2d
      ? undefined
      : updateHashHistoryState(e.hashParams, "/", {
          removeKeys: ["zoom"],
          label: "app/hgk:3D",
        });
  };

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

  useEffect(() => {
    if (searchParams.has(VIEWERSTATE_KEYS.is3d)) {
      const is3d = searchParams.get(VIEWERSTATE_KEYS.is3d) === "1";
      dispatch(setIsMode2d(!is3d));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      isViewerReady &&
      viewerRef.current &&
      !viewerRef.current.isDestroyed()
    ) {
      const viewer = viewerRef.current;
      // remove default cesium credit because no ion resource is used;
      (viewer as any)._cesiumWidget._creditContainer.style.display = "none";
      viewer.scene.requestRender();
    }
  }, [viewerRef, isViewerReady]);

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
                onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Maßstab vergrößern (Zoom in)"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              {/* <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right"> */}
              <ControlButtonStyler
                onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
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
                disabled={isMode2d}
                //ref={tourRefLabels.alignNorth}
                dataTestId="compass-control"
                title="Nach Norden ausrichten"
              >
                <PitchingCompass
                  viewerRef={viewerRef}
                  viewerAnimationMapRef={viewerAnimationMapRef}
                  isViewerReady={isViewerReady}
                />
              </ControlButtonStyler>
              {/* </Tooltip> */}

              <MapTypeSwitcher
                className="!rounded-t-none !border-t-[1px]"
                duration={CESIUM_CONFIG.transitions.mapMode.duration}
                nativeTooltip={true}
                enableMobileWarning={true}
              />
            </div>
          </Control>
          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60}>
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={!isMode2d}
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
          isMode2d
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
          opacity: isMode2d ? 0 : 1,
          transition: `opacity ${CESIUM_CONFIG.transitions.mapMode.duration}ms ease-in-out`,
          pointerEvents: isMode2d ? "none" : "auto",
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
