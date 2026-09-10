import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "@carma-mapping/addons";
import type { WorkflowDefinition } from "@carma-mapping/layers";
import { isAvailable } from "@carma-commons/utils";

import { availabilityContext } from "../config/availability";
import { SCHWEBEBAHN_VEHICLE } from "./schwebebahn";

/**
 * Workflows that are on the map without anyone adding them.
 *
 * A default workflow is written as the workflow cards are (`WorkflowDefinition`
 * in mapping-layers), so its title and texts are the ones the layer row will
 * show, and a card can become a default by moving between the two lists. What
 * makes it a default is only that it lives here: `defaultWorkflowAddons` turns
 * its tools into addon entries that every route mounts and that launch
 * themselves at mount, see `withDefaultAddons` in `config/app.config.ts`.
 *
 * Only the payload of a card's `tools` is supported. A workflow whose payload
 * is `layers` (a catalog layer group) is skipped with a warning; making the
 * catalog add a group on every route is a different mechanism.
 */
export const DEFAULT_WORKFLOWS: WorkflowDefinition<AddonEntry>[] = [
  {
    id: "schwebebahn",
    title: "Schwebebahn",
    // Same reach as the `workflows` Fachzwilling the card came from. The
    // Schwebebahn is the first workflow to run unasked on every route, so it
    // stays off the production geoportal until that has been seen in dev.
    availability: {
      deployments: ["localDev", "dev", "pr"],
    },
    description:
      "Inhalt: Mehrere Schwebebahnen, die im Takt über die Trasse " +
      "fahren und an jeder Station halten. " +
      "Sichtbarkeit: öffentlich. " +
      "Nutzung: Zeigt den Betrieb auf der Strecke, nicht nur ihren " +
      "Verlauf. Über den Knopf in der Layer-Zeile lassen sich die " +
      "Fahrten anhalten.",
    metaDataText:
      "Grundlage ist die Mittellinie des 3D-Trassenmodells der Stadt " +
      "Wuppertal, die Stationen stammen aus OpenStreetMap. Gefahren " +
      "wird im 3:40-Takt mit 25 Sekunden Halt je Station und 36 km/h " +
      "zwischen den Halten, zusammen die rund 27 km/h " +
      "Durchschnittsgeschwindigkeit der Schwebebahn. Die Fahrzeuge " +
      "sind GTW 15: 24,06 m lang, 2,2 m breit, zwei Fahrgastteile mit " +
      "einem kurzen Mittelteil dazwischen, verbunden über zwei Gelenke.",
    tools: [{ addon: "vehicleAnimation", config: SCHWEBEBAHN_VEHICLE }],
  },
];

/**
 * The addon kinds a default workflow can carry: the four engines that idle
 * until something launches a definition into them, and that therefore can be
 * handed a definition through their own config. Any other kind is configured
 * as a plain default addon (`DEFAULT_ADDONS`) rather than as a workflow.
 */
const LAUNCHABLE_ADDON_KINDS = [
  "timeSlider",
  "flowField",
  "vehicleAnimation",
  "floodSimulation",
] as const;

type LaunchableAddonKind = (typeof LAUNCHABLE_ADDON_KINDS)[number];

const isLaunchable = (kind: AddonKind): kind is LaunchableAddonKind =>
  (LAUNCHABLE_ADDON_KINDS as readonly AddonKind[]).includes(kind);

/**
 * The default workflows of this deployment as addon entries.
 *
 * `startEnabled` is what turns a mounted engine into a running one. Three of
 * the four kinds default to it anyway; `floodSimulation` does not, and a
 * default workflow means "on the map" for every kind alike, so it is set here
 * rather than left to each card to remember.
 *
 * `permanent` says the layer-bar row is the app's: no button, no removal, only
 * its visibility. Each engine carries the flag into the row it builds, which
 * `vehicleAnimation` does; the other three follow when one of them is first
 * used as a default, and until then their row would stay an ordinary one.
 */
export const defaultWorkflowAddons = (
  workflows: WorkflowDefinition<AddonEntry>[] = DEFAULT_WORKFLOWS
): AddonEntry[] =>
  workflows
    .filter((workflow) =>
      isAvailable(workflow.availability, availabilityContext)
    )
    .flatMap((workflow) => {
      if (!workflow.tools?.length) {
        console.warn(
          `[DEFAULT WORKFLOWS] "${workflow.id}" carries no tools and is ` +
            "skipped; a default workflow's payload has to be an addon tool."
        );
        return [];
      }
      return normalizeAddonEntries(workflow.tools).flatMap(
        ({ kind, config }) => {
          if (!isLaunchable(kind)) {
            console.warn(
              `[DEFAULT WORKFLOWS] "${workflow.id}" declares the addon ` +
                `"${kind}", which cannot be launched from its config; ` +
                "declare it in DEFAULT_ADDONS instead."
            );
            return [];
          }
          // The kind and its config are correlated by `normalizeAddonEntries`,
          // which the mapped `AddonWithName` type cannot express over a union.
          return [
            {
              addon: kind,
              config: {
                ...(config ?? {}),
                startEnabled: true,
                permanent: true,
              },
            } as AddonEntry,
          ];
        }
      );
    });
