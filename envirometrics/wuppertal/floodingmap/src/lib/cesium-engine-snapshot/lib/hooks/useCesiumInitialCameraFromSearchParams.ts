import { useEffect, useState } from "react";
import { decodeCesiumCamera } from "../utils/cesiumHashParamsCodec";
import { InitialCameraView } from "../CustomViewer";
import { getHashParams } from "@carma-commons/utils";

// null means not set, undefined means no camera view found
export const useCesiumInitialCameraFromSearchParams = () => {
  const [initialCameraView, setInitialCameraView] = useState<
    InitialCameraView | undefined | null
  >(null);

  useEffect(() => {
    const hashParams = getHashParams();
    const view = decodeCesiumCamera(hashParams);
    if (view && initialCameraView === null) {
      setInitialCameraView(view);
    } else {
      setInitialCameraView(undefined);
    }
    // only evaluate url once on load for intial view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return initialCameraView;
};
