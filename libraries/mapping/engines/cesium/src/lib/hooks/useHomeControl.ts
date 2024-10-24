import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { selectViewerHome, setIsAnimating } from "../slices/cesium";

export const useHomeControl = () => {
  const dispatch = useDispatch();
  const viewer = useCesiumViewer();
  const homePosition = useSelector(selectViewerHome);
  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    homePosition &&
      setHomePos(
        new Cartesian3(homePosition.x, homePosition.y, homePosition.z)
      );
  }, [homePosition]);

  const handleHomeClick = useCallback(() => {
    console.log("homePos click", homePos, viewer);
    if (viewer && homePos) {
      dispatch(setIsAnimating(false));
      const boundingSphere = new BoundingSphere(homePos, 400);
      console.log("HOOK: [2D3D|CESIUM|CAMERA] homeClick");
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  }, [viewer, homePos, dispatch]);

  return handleHomeClick;
};
