import { useEffect, useState } from "react";
import { decodeCesiumCamera } from "../utils/cesiumHashParamsCodec";
import { useSearchParams } from "react-router-dom";
import { InitialCameraView } from "../CustomViewer";

// null means not set, undefined means no camera view found
export const useCesiumInitialCameraFromSearchParams = () => {
  const [searchParams] = useSearchParams();
  const [initialCameraView, setInitialCameraView] = useState<
    InitialCameraView | undefined | null
  >(null);

  useEffect(() => {
    const view = decodeCesiumCamera(searchParams);
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
