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
  addons: [],
  background: {
    layerMap: {
      stadtplan: { layers: "amtlich@90|bergisches_staedtedreieck@100" },
    },
  },
};
