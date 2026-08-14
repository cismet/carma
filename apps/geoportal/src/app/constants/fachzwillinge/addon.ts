import type { FachzwillingRoute } from ".";

export const addonFachzwilling: FachzwillingRoute = {
  path: "addon",
  hideFromCatalog: true,
  title: "Addons",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [{ kind: "addonManager", config: { showControl: true } }],
};
