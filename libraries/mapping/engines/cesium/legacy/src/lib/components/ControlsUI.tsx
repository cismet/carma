import { useSelector } from "react-redux";

import { selectViewerHome, selectViewerIsMode2d } from "../slices/cesium";

import { Compass } from "./controls/Compass";
import ControlContainer from "./controls/ControlContainer";
import ControlGroup from "./controls/ControlGroup";
import { HomeControl } from "./controls/HomeControl";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useDispatch } from "react-redux";
import { setIsMode2d } from "../slices/cesium";
import LockCenterControl from "./controls/LockCenterControl";
import OrbitControl from "./controls/OrbitControl";
import { SceneStyleToggle } from "./controls/SceneStyleToggle";
import ZoomControls from "./controls/ZoomControls";

const ControlsUI = ({
  showHome = true,
  showOrbit = true,
  isViewerReady,
}: {
  showHome?: boolean;
  showOrbit?: boolean;
  isViewerReady: boolean;
}) => {
  const dispatch = useDispatch();
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
          <ControlButtonStyler
            onClick={() => dispatch(setIsMode2d(!isMode2d))}
            dataTestId="toggle-2d-3d"
          >
            {isMode2d ? "3D" : "2D"}
          </ControlButtonStyler>
          <SceneStyleToggle />
        </ControlGroup>
      </ControlContainer>
    </div>
  );
};

export default ControlsUI;
