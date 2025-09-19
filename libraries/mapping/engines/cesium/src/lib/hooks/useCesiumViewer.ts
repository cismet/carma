import { Viewer } from "cesium";
import { useCesiumContext } from "./useCesiumContext";

export const useCesiumViewer = (): Viewer | undefined => {
  const { withWidget } = useCesiumContext();
  let viewer: Viewer | undefined;
  withWidget((w) => {
    viewer = w as Viewer;
  });
  if (!viewer) {
    return;
  }
  return viewer;
};
