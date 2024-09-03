import { ReactNode, MouseEvent, useEffect, useState } from "react";
import { BoundingSphere, Cartesian3 } from "cesium";
import { faHouseUser } from "@fortawesome/free-solid-svg-icons";
import {
  setIsAnimating,
  useViewerHome,
} from "../../../CustomViewerContextProvider/slices/cesium";
import { useDispatch } from "react-redux";
import { useCesiumCustomViewer } from "../../../CustomViewerContextProvider";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type HomeProps = {
  children?: ReactNode;
};

export const HomeControl = (props: HomeProps) => {
  const dispatch = useDispatch();
  const { viewer } = useCesiumCustomViewer();
  const homePosition = useViewerHome();
  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    viewer &&
      homePosition &&
      setHomePos(
        new Cartesian3(homePosition.x, homePosition.y, homePosition.z),
      );
  }, [viewer, homePosition]);

  const handleHomeClick = (e: MouseEvent) => {
    e.preventDefault();
    console.log("homePos click", homePos, viewer);
    if (viewer && homePos) {
      dispatch(setIsAnimating(false));
      const boundingSphere = new BoundingSphere(homePos, 400);
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  };

  return (
    <ControlButtonStyler
      onClick={handleHomeClick}
      title="Startposition"
    >
      <FontAwesomeIcon icon={faHouseUser} />
    </ControlButtonStyler>
  );
};

export default HomeControl;
