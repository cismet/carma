import type { Positions } from "@carma-mapping/map-controls-layout";
import type { CesiumTerrainRuntimeOptions } from "@carma-mapping/engines/maplibre";

import type { SolarSelection } from "../core/solar-position";
import type {
  MeshErrorTargetPixels,
  ShadowQualityMultiplier,
} from "../core/shadow-types";

export type ShadowTerrainOptions = Readonly<{ url: string }> &
  Omit<CesiumTerrainRuntimeOptions, "onError" | "onContentChanged">;

export type ShadowSceneOptions = {
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
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
  terrain?: ShadowTerrainOptions;
  controlPosition?: Positions;
  controlOrder?: number;
};

export type ShadowSimulationState = {
  enabled: boolean;
  terrainColor: string;
  buildingsFullOpacity: boolean;
  buildingColorMix: number;
  meshTextureSaturation?: number;
  buildingColor: string;
  shadowQuality: ShadowQualityMultiplier;
  meshErrorTarget?: MeshErrorTargetPixels;
  showSunDebugVector: boolean;
  showProjectionDebugView?: boolean;
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
