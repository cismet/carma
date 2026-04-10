import { useEffect } from "react";
import {
  type Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "@carma-cesium";
import { isValidScene } from "@carma-mapping/engines/cesium/core";
type UsePolygonFillSelectionHandlerParams = {
  scene: Scene;
  selectionModeActive: boolean;
  clearSelection: () => void;
  selectByPolygonGroupId: (groupId: string) => void;
};

const pickPolygonGroupId = (
  scene: Scene,
  screenPosition: Cartesian2
): string | null => {
  const picked = scene.pick(screenPosition);
  const id = picked?.id?.polygonGroupId;
  return typeof id === "string" && id.trim() ? id : null;
};

export { pickPolygonGroupId };

export const usePolygonFillSelectionHandler = ({
  scene,
  selectionModeActive,
  clearSelection,
  selectByPolygonGroupId,
}: UsePolygonFillSelectionHandlerParams) => {
  useEffect(
    function effectBindPolygonFillSelectionClickHandler() {
      if (!isValidScene(scene) || !selectionModeActive) {
        return;
      }

      const clickHandler = new ScreenSpaceEventHandler(scene.canvas);
      clickHandler.setInputAction((event) => {
        const screenPosition = event.position;
        if (!screenPosition) return;

        const pickedGroupId = pickPolygonGroupId(scene, screenPosition);
        if (pickedGroupId) {
          selectByPolygonGroupId(pickedGroupId);
        } else {
          clearSelection();
        }
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        clickHandler.destroy();
      };
    },
    [scene, selectionModeActive, clearSelection, selectByPolygonGroupId]
  );
};
