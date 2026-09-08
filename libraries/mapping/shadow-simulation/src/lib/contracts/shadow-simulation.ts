import type { Positions } from "@carma-mapping/map-controls-layout";
import type { RasterDemTerrainRuntimeOptions } from "@carma-mapping/engines/maplibre";
import type { RasterDemTerrainResource } from "@carma-commons/resources";

import type { SolarSelection } from "../core/solar-position";
import type {
  MeshErrorTargetPixels,
  ShadowQualityMultiplier,
  ShadowRenderQualityOptions,
} from "../core/shadow-types";

export type ShadowTerrainOptions = RasterDemTerrainResource &
  Omit<
    RasterDemTerrainRuntimeOptions,
    "onError" | "onContentChanged" | "receivesMapStyleTexture"
  >;

export type ShadowTerrainSourceOption = Readonly<{
  label: string;
  terrain: ShadowTerrainOptions;
}>;

export const SHADOW_TERRAIN_QUALITY = {
  STANDARD: "standard",
  HIGH: "high",
  MAX: "max",
  ULTRA: "ultra",
  EXTREME: "extreme",
} as const;

export type ShadowTerrainQuality =
  (typeof SHADOW_TERRAIN_QUALITY)[keyof typeof SHADOW_TERRAIN_QUALITY];

export type ShadowSceneOptions = {
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  /** Independent surface used by MapLibre for basemap draping. */
  mapLibreTerrain?: RasterDemTerrainResource;
  terrainQuality?: ShadowTerrainQuality;
};

export const SHADOW_CONTROL_STYLE = {
  QUICK: "quick",
  CURVE: "curve",
} as const;

export type ShadowControlStyle =
  (typeof SHADOW_CONTROL_STYLE)[keyof typeof SHADOW_CONTROL_STYLE];

export const SHADOW_ANIMATION_MODE = {
  DAY: "day",
  YEAR: "year",
} as const;

export type ShadowAnimationMode =
  (typeof SHADOW_ANIMATION_MODE)[keyof typeof SHADOW_ANIMATION_MODE];

export type ShadowAnimationSpeed = 1 | 4 | 12;

export type ShadowSimulationConfig = {
  year?: number;
  initialDayOfYear?: number;
  initialMinutes?: number;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  shadowAreaMeters?: number;
  /** Primary terrain source, retained for single-source configurations. */
  terrain?: ShadowTerrainOptions;
  /** Pinned draping source; selecting a shadow source does not change it. */
  mapLibreTerrain?: RasterDemTerrainResource;
  /** Selectable terrain sources. The first entry is the initial source. */
  terrainSources?: readonly ShadowTerrainSourceOption[];
  controlPosition?: Positions;
  controlOrder?: number;
};

export type ShadowSimulationState = ShadowRenderQualityOptions & {
  enabled: boolean;
  terrainColor: string;
  terrainSourceId?: string;
  terrainQuality?: ShadowTerrainQuality;
  buildingsFullOpacity: boolean;
  buildingColorMix: number;
  meshTextureSaturation?: number;
  buildingColor: string;
  shadowQuality: ShadowQualityMultiplier;
  meshErrorTarget?: MeshErrorTargetPixels;
  /** Optional explicit resident budget; absent uses the device default. */
  meshCacheBudgetBytes?: number;
  showSunDebugVector: boolean;
  showProjectionDebugView?: boolean;
  showDisplaySettings?: boolean;
  showTileBounds?: boolean;
  softSunShadows?: boolean;
  showMapStyleContent?: boolean;
  showMapStyleLabels?: boolean;
  useTransmittanceLut?: boolean;
  useSkyIrradianceLut?: boolean;
  controlStyle?: ShadowControlStyle;
  animationMode?: ShadowAnimationMode;
  animationSpeed?: ShadowAnimationSpeed;
  isAnimating?: boolean;
  shadowIntensity?: number;
};

export type ShadowDateState = SolarSelection;

export type ShadowSimulationStateAction =
  | ShadowSimulationState
  | ((previous: ShadowSimulationState | undefined) => ShadowSimulationState);

export type ShadowSimulationStateSetter = (
  action: ShadowSimulationStateAction
) => void;

export type ShadowDateStateAction =
  | ShadowDateState
  | ((previous: ShadowDateState | undefined) => ShadowDateState);

export type ShadowDateStateSetter = (action: ShadowDateStateAction) => void;
