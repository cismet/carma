import ControlContainer from "./controls/ControlContainer";
import ControlGroup from "./controls/ControlGroup";
import { HomeControl } from "./controls/HomeControl";
import LockCenterControl from "./controls/LockCenterControl";
import OrbitControl from "./controls/OrbitControl";
import ZoomControls from "./controls/ZoomControls";

import { Compass } from "./controls/Compass";
import { SceneStyleToggle } from "./controls/SceneStyleToggle";
import { MapTypeSwitcher } from "./controls/MapTypeSwitcher";
import {
  useViewerHome,
  useViewerIsMode2d,
} from "../../CustomViewerContextProvider/slices/cesium";
const ControlsUI = ({ showHome = true, showOrbit = true, searchComponent }) => {
  const home = useViewerHome();
  const isMode2d = useViewerIsMode2d();

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
          <ZoomControls />
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
          <MapTypeSwitcher />
          <SceneStyleToggle />
        </ControlGroup>
      </ControlContainer>
      <ControlContainer position="bottomleft">
        <ControlGroup useLeafletElements={false}>
          {!isMode2d && searchComponent}
        </ControlGroup>
      </ControlContainer>
    </div>
  );
};

export default ControlsUI;
