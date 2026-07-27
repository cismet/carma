/// <reference path="./global.d.ts" />
import { gazetteer } from "./lib/gazetteer";
import { mapping, mapping2D, mapping3D } from "./lib/mapping";
import { ui } from "./lib/ui";

export const carma = { gazetteer, mapping, mapping2D, mapping3D, ui } as const;

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
