import { isAvailable, type Availability } from "@carma-commons/utils";
import { loadMeasurement3dTestSceneMeasurements } from "@carma-mapping/annotations/maplibre";

import { availabilityContext } from "../config/availability";

const TEST_SCENE_AVAILABILITY: Availability = {
  deployments: ["localDev", "dev", "pr"],
};

/**
 * Configurations the app answers itself instead of asking the config service,
 * so a PR deployment or an end-to-end run opens a ready scene from a plain
 * link (`#/?config=test-measurement3d`). They take the path of a shared
 * configuration, layers and measurements included, and exist only on local,
 * dev and PR deployments.
 */
const TEST_SCENES = new Map<string, () => Promise<unknown>>([
  // Mesh 2024 at the Rathaus Barmen courtyard, one measurement of every type
  [
    "test-measurement3d",
    async () => {
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
  ],
]);

/** The scene of that id, or null when it names none or the deployment has none. */
export const loadTestSceneConfig = async (
  id: string
): Promise<unknown | null> => {
  const load = TEST_SCENES.get(id);
  if (!load || !isAvailable(TEST_SCENE_AVAILABILITY, availabilityContext)) {
    return null;
  }
  return load();
};
