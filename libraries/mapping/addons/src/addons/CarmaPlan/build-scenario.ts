import { buildConstructionSite } from "./construction";
import type { GroundSampler } from "./ground";
import { buildParkingLot } from "./parking";
import { buildPlayground } from "./playground";
import type { CarmaPlanScenario, CarmaPlanScenarioId } from "./scenario";
import type { CarmaPlanSite } from "./site";
import { createSiteFrame, type SiteFrame } from "./site-frame";

const BUILDERS: Record<
  CarmaPlanScenarioId,
  (frame: SiteFrame) => CarmaPlanScenario
> = {
  construction: buildConstructionSite,
  parking: buildParkingLot,
  playground: buildPlayground,
};

/** Build scenario `id` on the outer rings of the site's polygons over `ground`. */
export const buildCarmaPlanScenario = (
  id: CarmaPlanScenarioId,
  site: CarmaPlanSite,
  ground: GroundSampler
): CarmaPlanScenario =>
  BUILDERS[id](createSiteFrame(site.polygons, ground, site.entrances));
