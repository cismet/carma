import { Viewer } from "cesium";
import { useCesiumContext } from "./useCesiumContext";

export const useCesiumViewer = (): Viewer | undefined => {
  const { withViewer } = useCesiumContext();
  let viewer: Viewer | undefined;
  withViewer((v) => {
    viewer = v;
  });
  if (!viewer) {
    return;
  }
  return viewer;
};
