import { ReactNode, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import { detectWebGLContext, GazDataItem } from "@carma-commons/utils";

import {
  CustomViewer,
  selectViewerIsMode2d,
  setIsMode2d,
  useCesiumContext,
  setCurrentSceneStyle,
  CesiumConfig,
} from "@carma-mapping/cesium-engine";

import { getBackgroundLayer } from "../../store/slices/mapping.ts";
import { getUIAllow3d } from "../../store/slices/ui.ts";

import "../leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

type CarmaMapProps = {
  children: ReactNode;
  applicationMenuTooltipString: string;
  backgroundlayers: string;
  cesiumOptions: CesiumConfig;
  fullScreenControl: boolean;
  gazData: GazDataItem[];
  hamburgerMenu: ReactNode;
  infoBox: ReactNode;
  leafletMapProps: any;
  locationChangedHandler: (location: any) => void;
  locatorControl: boolean;
  mappingBoundsChanged: (boundingbox: any) => void;
  mapStyle: { width: number; height: number };
  minZoom: number;
  modalMenu: ReactNode;
  onclick: (e: any) => void;
  onSceneChange: (e: any) => void;
  zoomControls: boolean;
  zoomDelta: number;
  zoomSnap: number;
};

export const CarmaMap = ({
  children,
  applicationMenuTooltipString,
  backgroundlayers,
  cesiumOptions,
  fullScreenControl,
  gazData,
  hamburgerMenu,
  infoBox,
  leafletMapProps,
  locationChangedHandler,
  locatorControl,
  mappingBoundsChanged,
  mapStyle,
  minZoom,
  modalMenu,
  onclick,
  onSceneChange,
  zoomControls,
  zoomDelta,
  zoomSnap,
}: CarmaMapProps) => {
  const dispatch = useDispatch();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d) && hasGPU;
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const { viewerRef, terrainProviderRef, surfaceProviderRef } =
    useCesiumContext();

  useEffect(() => {
    // TODO wrap this with 3d component in own component?
    // INTIALIZE Cesium Tileset style from Geoportal/TopicMap background later style
    if (viewerRef.current && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  useEffect(() => {
    // set 2d mode if allow3d is false or undefined
    if (allow3d === false || allow3d === undefined) {
      dispatch(setIsMode2d(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow3d]);

  // debug rerender count and interval
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();
  console.debug("RENDER: [CARMAMAP] MAP", rerenderCountRef.current, lastRenderIntervalRef.current);


  return (
    <>
      <div className={"map-container-2d"} style={{ zIndex: 400 }}>
        <TopicMapComponent
          applicationMenuTooltipString={applicationMenuTooltipString}
          backgroundlayers={backgroundlayers}
          fullScreenControl={fullScreenControl}
          gazData={gazData}
          hamburgerMenu={hamburgerMenu}
          infoBox={infoBox}
          leafletMapProps={leafletMapProps}
          locatorControl={locatorControl}
          mappingBoundsChanged={mappingBoundsChanged}
          mapStyle={mapStyle}
          minZoom={minZoom}
          modalMenu={modalMenu}
          locationChangedHandler={locationChangedHandler}
          onclick={onclick}
          gazetteerSearchComponent={<></>} // TODO change topicmap interface here to have false null option
          zoomControls={zoomControls}
          zoomDelta={zoomDelta}
          zoomSnap={zoomSnap}
        >
          {children}
        </TopicMapComponent>
      </div>
      {allow3d && (
        <div
          ref={container3dMapRef}
          className={"map-container-3d"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 401,
            opacity: isMode2d ? 0 : 1,
            transition: `opacity ${cesiumOptions.transitions.mapMode.duration}ms ease-in-out`,
            pointerEvents: isMode2d ? "none" : "auto",
          }}
        >
          <CustomViewer
            containerRef={container3dMapRef}
            cameraOptions={cesiumOptions.camera}
            onSceneChange={onSceneChange}
          ></CustomViewer>
        </div>
      )}
    </>
  );
};

export default CarmaMap;
