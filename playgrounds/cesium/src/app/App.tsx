import React, { useRef } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import {
  CesiumContextProvider,
  Compass,
  CustomViewer,
  MapTypeSwitcher,
  useHomeControl,
  useZoomControls,
} from "@carma-mapping/cesium-engine";
import { TweakpaneProvider } from "@carma-commons/debug";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";

import { Navigation } from "./components/Navigation";
import { viewerRoutes, otherRoutes } from "./routes";
import { routeGenerator } from "./utils/routeGenerator";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  const container3dMapRef = useRef<HTMLDivElement>(null);

  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControls();

  const onFullscreenClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const onHomeClick = () => {
    homeControl();
  };

  return (
    <HashRouter>
      <Navigation
        className="leaflet-bar"
        style={{
          position: "absolute",
          top: 8,
          left: "50%",
          width: "auto",
          display: "flex",
          justifyContent: "center",
          transform: "translate(-50%, 0)",
          zIndex: 10,
        }}
        routes={[...viewerRoutes, ...otherRoutes]}
      />
      <Routes>
        <Route
          path="/*"
          element={
            <>
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
                      <Tooltip
                        title="Maßstab vergrößern (Zoom in)"
                        placement="right"
                      >
                        <ControlButtonStyler
                          onClick={handleZoomInCesium}
                          className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                          dataTestId="zoom-in-control"
                        >
                          <FontAwesomeIcon
                            icon={faPlus}
                            className="text-base"
                          />
                        </ControlButtonStyler>
                      </Tooltip>
                      <Tooltip
                        title="Maßstab verkleinern (Zoom out)"
                        placement="right"
                      >
                        <ControlButtonStyler
                          onClick={handleZoomOutCesium}
                          className="!rounded-t-none !border-t-[1px]"
                          dataTestId="zoom-out-control"
                        >
                          <FontAwesomeIcon
                            icon={faMinus}
                            className="text-base"
                          />
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
                        icon={
                          document.fullscreenElement ? faCompress : faExpand
                        }
                      />
                    </ControlButtonStyler>
                  </Control>
                  <Control position="topleft" order={40}>
                    <ControlButtonStyler
                      onClick={onHomeClick}
                      dataTestId="home-control"
                    >
                      <FontAwesomeIcon
                        icon={faHouseChimney}
                        className="text-lg"
                      />
                    </ControlButtonStyler>
                  </Control>
                  <Control position="topleft" order={70}>
                    <Compass />
                  </Control>
                </ControlLayout>
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
                }}
              />
              <CustomViewer containerRef={container3dMapRef}>
                <Routes>{...ViewerRoutes}</Routes>
              </CustomViewer>
            </>
          }
        />
        {...OtherRoutes}
      </Routes>
    </HashRouter>
  );
}
export default App;
