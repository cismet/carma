import type { FachzwillingRoute } from ".";

export const outletFachzwilling: FachzwillingRoute = {
  path: "outlet",
  hideFromCatalog: true,
  ui: { hideAll: true },
  disableMapInteraction: true,
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
};
