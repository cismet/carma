import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";
import { selectViewerHome, clearIsAnimating } from "../slices/cesium";

export const useHomeControl = () => {
  const dispatch = useDispatch();
  const viewer = useCesiumViewer();
  const ctx = useCesiumContext();
  const homePosition = useSelector(selectViewerHome);

  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    homePosition && setHomePos(homePosition);
  }, [homePosition]);

  const handleHomeClick = useCallback(() => {
    console.debug("homePos click", homePos, viewer);
    // TODO register a event callback or prop here what oblique mode should listen too
    // Notify subscribers that a Home fly has been triggered (hide overlays, etc.)
    if (viewer && homePos) {
      dispatch(clearIsAnimating());
      const boundingSphere = new BoundingSphere(homePos, 400);
      console.debug("HOOK: [2D3D|CESIUM|CAMERA] homeClick");
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  }, [viewer, homePos, dispatch, ctx]);

  return handleHomeClick;
};
