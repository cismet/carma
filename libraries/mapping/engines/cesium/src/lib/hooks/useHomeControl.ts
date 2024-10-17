import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  selectViewerHome,
  setIsAnimating,
} from "../slices/cesium";

export const useHomeControl = () => {
  const dispatch = useDispatch();
  const { viewer } = useCesiumContext();
  const homePosition = useSelector(selectViewerHome);
  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    viewer &&
      homePosition &&
      setHomePos(
        new Cartesian3(homePosition.x, homePosition.y, homePosition.z),
      );
  }, [viewer, homePosition]);

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
