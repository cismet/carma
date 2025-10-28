import type { MapView } from "./types/MapView.d";

export const validateMapView = (view: unknown): view is MapView => {
  return (
    view &&
    typeof view === "object" &&
    view.center &&
    typeof view.center === "object" &&
    typeof view.center.lat === "number" &&
    typeof view.center.lng === "number" &&
    typeof view.zoom === "number"
  );
};
