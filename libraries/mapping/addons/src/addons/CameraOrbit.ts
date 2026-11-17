import { faRotate } from "@fortawesome/free-solid-svg-icons";

import type { AddonTrigger } from "../lib/registry";

export type CameraOrbitConfig = {
  label?: string;
};

const DEFAULT_LABEL = "Um die aktuelle Ansicht kreisen";

/**
 * Turns the MapLibre camera around the middle of the current view, keeping
 * pitch and zoom; a second click, or any input on the map, stops it.
 */
export const cameraOrbitTrigger: AddonTrigger<"cameraOrbit"> = {
  icon: faRotate,
  label: ({ config }) => config?.label ?? DEFAULT_LABEL,
  onClick: ({ carma }) => {
    carma.mapping2D.toggleOrbit();
  },
};
