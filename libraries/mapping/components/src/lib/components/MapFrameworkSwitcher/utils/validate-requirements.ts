import { isValidScene } from "@carma/cesium";
import { LeafletMap, isLeafletMap } from "@carma-mapping/engines/leaflet";

const isValidContainer = (container: unknown): boolean => {
  const isValidElement =
    container instanceof HTMLDivElement || container instanceof HTMLElement;

  if (!isValidElement) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] cesium container not available no transition possible"
    );
    return false;
  }

  const rect = container.getBoundingClientRect();
  if (
    rect.width === 0 ||
    rect.height === 0 ||
    Number.isFinite(rect.width) === false ||
    Number.isFinite(rect.height) === false
  ) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] Container has invalid dimensions, cannot transition"
    );
    return false;
  } else {
    console.debug(
      "[CESIUM|LEAFLET|TRANSITION] Container dimensions used for transition",
      rect.width,
      rect.height
    );
    return true;
  }
};

export const validateRequirements = (
  scene: unknown,
  cesiumContainer: HTMLDivElement | HTMLElement,
  leaflet: LeafletMap
): boolean => {
  if (isValidScene(scene) === false) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] cesium scene not valid no transition possible"
    );
    return false;
  }

  if (!isValidContainer(cesiumContainer)) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] cesium container not available no transition possible"
    );
    return false;
  }

  if (!isLeafletMap(leaflet)) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] leaflet map instance is not valid, cannot transition"
    );
    return false;
  }

  return true;
};
