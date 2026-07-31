/// <reference path="./global.d.ts" />
import { config } from "./lib/config";
import { gazetteer } from "./lib/gazetteer";
import { mapping, mapping2D, mapping3D } from "./lib/mapping";
import { ui } from "./lib/ui";

export const carma = {
  config,
  gazetteer,
  mapping,
  mapping2D,
  mapping3D,
  ui,
} as const;

export { registerConfig } from "./lib/config";
export type { ConfigAdapter, ConfigFacade } from "./lib/config";

export { registerMapping } from "./lib/mapping";
export type {
  MapAdapter,
  MappingFacade,
  Mapping2DFacade,
  Mapping3DFacade,
  MapMode,
  Position2D,
  CameraPosition3D,
  BackgroundLayerInfo,
} from "./lib/mapping";

export { registerUi } from "./lib/ui";
export type { UiAdapter, UiFacade } from "./lib/ui";

export { registerGazetteer } from "./lib/gazetteer";
export type {
  GazetteerAdapter,
  GazetteerContribution,
  GazetteerFacade,
  GazetteerMode,
  GazetteerSource,
} from "./lib/gazetteer";
