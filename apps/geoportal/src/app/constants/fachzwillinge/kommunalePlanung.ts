import type { FachzwillingRoute } from ".";

const planungKeywords = [
  "Bebauungsplan",
  "Flächennutzungsplan",
  "Planung",
  "Stadtentwicklung",
  "Baulücke",
  "Sanierung",
  "Denkmal",
];

export const kommunalePlanungFachzwilling: FachzwillingRoute = {
  path: "kommunale-planung",
  title: "Kommunale Planung",
  description:
    "Beschreibung: Der Fachzwilling Kommunale Planung bündelt die " +
    "Karteninhalte des Geoportals zu Bauleitplanung, Stadtentwicklung und " +
    "Flächennutzung.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [
    {
      field: "keywords",
      values: planungKeywords,
    },
  ],
  addons: [
    {
      kind: "homeOverride",
      config: {
        lat: 51.2178674,
        lng: 7.178007,
        zoom: 12.281,
        tooltip: "Auf das Stadtgebiet positionieren",
        overlayLabel: "Zum Stadtgebiet",
        overlayDestination: "auf das Stadtgebiet",
      },
    },
  ],
  background: {
    layerMap: {
      stadtplan: { layers: "amtlich@90|bergisches_staedtedreieck@100" },
    },
  },
};
