import { isValidScene } from "@carma-mapping/engines/cesium/core";
import { LeafletMap } from "@carma-mapping/engines/leaflet";

// Structural instead of `instanceof L.Map`: the 2D side of the transition is
// only ever used through this handful of methods, so any engine that provides
// them (leaflet itself, or a maplibre facade) can drive it.
const isTransitionCapable2dMap = (map: unknown): boolean => {
  if (!map || typeof map !== "object") {
    return false;
  }
  const candidate = map as Record<string, unknown>;
  return (
    typeof candidate.getCenter === "function" &&
    typeof candidate.getZoom === "function" &&
    typeof candidate.setView === "function" &&
    typeof candidate.flyTo === "function" &&
    typeof candidate.stop === "function"
  );
};

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

  if (!isTransitionCapable2dMap(leaflet)) {
    console.warn(
      "[CESIUM|LEAFLET|TRANSITION] 2d map instance is not valid, cannot transition"
    );
    return false;
  }

  return true;
};
