import { isAvailable, type Availability } from "@carma-commons/utils";
import { loadMeasurement3dTestSceneMeasurements } from "@carma-mapping/annotations/maplibre";

import { availabilityContext } from "../config/availability";

/**
 * Configurations the app answers itself instead of asking the config
 * service, so a PR deployment or an end-to-end run opens a ready scene from
 * a plain link (`#/?config=test-measurement3d`) without a stored share. They
 * take the path a shared configuration takes, layers and measurements
 * included, and never exist on the live geoportal.
 *
 * Added with PR 837 to test the 3D measurements on the MapLibre view.
 * Whether this stays for end-to-end tests or goes before the merge is open.
 */
export const TEST_SCENE_IDS = {
  MEASUREMENT3D: "test-measurement3d",
} as const;

const TEST_SCENE_AVAILABILITY: Availability = {
  deployments: ["localDev", "dev", "pr"],
};

const TEST_SCENES: Record<string, () => Promise<unknown>> = {
  // Mesh 2024 at the Rathaus Barmen courtyard with one measurement of every
  // type; the base map stays whatever it was.
  [TEST_SCENE_IDS.MEASUREMENT3D]: async () => {
    const [{ default: meshLayer }, measurements3d] = await Promise.all([
      import("./measurement3d-mesh-layer.json"),
      loadMeasurement3dTestSceneMeasurements(),
    ]);
    return {
      layers: [meshLayer],
      view: { center: ["51.2720981", "7.2000445"], zoom: "20.471" },
      measurements3d,
    };
  },
};

/** The scene of that id, or null when it names none or the deployment has none. */
export const loadTestSceneConfig = async (
  id: string
): Promise<unknown | null> => {
  const load = TEST_SCENES[id];
  if (!load || !isAvailable(TEST_SCENE_AVAILABILITY, availabilityContext)) {
    return null;
  }
  return load();
};
