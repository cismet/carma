import type { Tiles3dCutoutPolygon } from "@carma-mapping/engines/maplibre";

import { buildConstructionSite } from "./construction";
import type { GroundSampler } from "./ground";
import { buildParkingLot } from "./parking";
import { buildPlayground } from "./playground";
import type { CarmaPlanScenario, CarmaPlanScenarioId } from "./scenario";
import { createSiteFrame, type SiteFrame } from "./site-frame";

const BUILDERS: Record<
  CarmaPlanScenarioId,
  (frame: SiteFrame) => CarmaPlanScenario
> = {
  construction: buildConstructionSite,
  parking: buildParkingLot,
  playground: buildPlayground,
};

/** Build scenario `id` on the outer rings of `polygons` over `ground`. */
export const buildCarmaPlanScenario = (
  id: CarmaPlanScenarioId,
  polygons: readonly Tiles3dCutoutPolygon[],
  ground: GroundSampler
): CarmaPlanScenario => BUILDERS[id](createSiteFrame(polygons, ground));
