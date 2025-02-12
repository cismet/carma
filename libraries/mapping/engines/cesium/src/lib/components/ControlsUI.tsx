import { useSelector } from "react-redux";
import { Viewer } from "cesium";

import { selectViewerHome, selectViewerIsMode2d } from "../slices/cesium";

import { Compass } from "./controls/Compass";
import ControlContainer from "./controls/ControlContainer";
import ControlGroup from "./controls/ControlGroup";
import { HomeControl } from "./controls/HomeControl";
import { MapTypeSwitcher } from "./controls/MapTypeSwitcher";
import LockCenterControl from "./controls/LockCenterControl";
import OrbitControl from "./controls/OrbitControl";
import { SceneStyleToggle } from "./controls/SceneStyleToggle";
import ZoomControls from "./controls/ZoomControls";
import { ViewerAnimationMap } from "../utils/viewerAnimationMap";

const ControlsUI = ({
  showHome = true,
  showOrbit = true,
  viewerRef,
  viewerAnimationMapRef,
  isViewerReady,
}: {
  showHome?: boolean;
  showOrbit?: boolean;
  viewerRef: React.RefObject<Viewer | null>;
  viewerAnimationMapRef: React.RefObject<ViewerAnimationMap | null>;
  isViewerReady: boolean;
}) => {
  const home = useSelector(selectViewerHome);

  const isMode2d = useSelector(selectViewerIsMode2d);

  return (
    <div className={"leaflet-control-container"}>
      <ControlContainer position="topleft">
        <div
          style={{
            //opacity: isMode2d ? 0 : 1,
            animation: isMode2d ? "fadeout 1s" : "fadein 1s",
            animationFillMode: "forwards",
            visibility: isMode2d ? "hidden" : "visible",
          }}
        >
          <ZoomControls
            viewerRef={viewerRef}
            viewerAnimationMapRef={viewerAnimationMapRef}
          />
          {showHome && home && (
            <ControlGroup>
              <HomeControl />
            </ControlGroup>
          )}
          {showOrbit && (
            <ControlGroup>
              <OrbitControl />
            </ControlGroup>
          )}
          <ControlGroup>
            <LockCenterControl />
          </ControlGroup>
          <ControlGroup>
            <Compass />
          </ControlGroup>
        </div>
        <ControlGroup>
          <MapTypeSwitcher forceEnabled={true} />
          <SceneStyleToggle />
        </ControlGroup>
      </ControlContainer>
    </div>
  );
};

export default ControlsUI;
