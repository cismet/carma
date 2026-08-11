import type { FunctionComponent } from "react";

import type { Positions } from "@carma-mapping/map-controls-layout";

/**
 * Bridge to the addons implemented in the closed-source cage repo.
 *
 * carma is public, cage is private, so cage is absent in any checkout without
 * credentials: forks, external contributors, and CI runs that get no secrets.
 * Importing `@carma-cage/*` directly would make those builds fail to resolve,
 * so the import goes through `import.meta.glob` instead, which yields an empty
 * object when the file is not there rather than erroring.
 *
 * Everything exported here is therefore optional at runtime. `AddonHost`
 * already renders nothing for a registry entry whose `Component` is undefined,
 * so an absent cage degrades to "the addon does nothing" with no extra guards
 * at the call sites.
 *
 * The config types live here, in the open, on purpose: `AddonConfigMap` is part
 * of carma's public surface and has to typecheck without cage present. Only the
 * implementations are caged. `CageVersionBadgeConfig` is mirrored in cage's
 * `src/mapping-addons/CageVersionBadge.tsx`; the two are matched structurally.
 */

export type CageVersionBadgeConfig = {
  /** Corner the badge is registered in. Default: "bottomleft" */
  position?: Positions;
  /** Sort order within that corner. Default: 100 */
  order?: number;
};

// FunctionComponent rather than ComponentType: the latter includes
// ComponentClass, whose props are invariant, so a component declaring only
// `config` would not satisfy `ComponentType<AddonComponentProps<K>>` in the
// registry. Function props are contravariant, so the narrower shape is fine.
type CagedMappingAddons = {
  CageVersionBadge?: FunctionComponent<{ config?: CageVersionBadgeConfig }>;
};

// Exact path rather than a wildcard: this is a single known entry point, and an
// eager glob of one file keeps the absent case to an empty record.
const modules = import.meta.glob<CagedMappingAddons>(
  "../../../../../cage/cage-submodule/src/mapping-addons/index.ts",
  { eager: true }
);

const caged: CagedMappingAddons = Object.values(modules)[0] ?? {};

export const CageVersionBadge = caged.CageVersionBadge;

/** Whether the caged implementations were present in this build. */
export const isCagedAvailable = Boolean(CageVersionBadge);
