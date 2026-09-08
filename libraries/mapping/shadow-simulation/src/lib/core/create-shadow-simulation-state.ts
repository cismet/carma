import {
  SHADOW_ANIMATION_MODE,
  SHADOW_CONTROL_STYLE,
  SHADOW_TERRAIN_QUALITY,
  type ShadowDateState,
  type ShadowSimulationConfig,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import {
  clampSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_TIME_ZONE,
  getSolarSelectionForInstant,
  type SolarLocation,
} from "./solar-position";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_BUILDING_COLOR,
  DEFAULT_SHADOW_BUILDING_COLOR_MIX,
  DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
  DEFAULT_SHADOW_QUALITY,
  resolveShadowSurfaceColor,
  SHADOW_QUALITY_PROFILES,
  type ShadowQualityMultiplier,
} from "./shadow-types";

export const selectShadowQualityPreset = (
  state: ShadowSimulationState,
  shadowQuality: ShadowQualityMultiplier
): ShadowSimulationState => ({
  ...state,
  shadowQuality,
  meshErrorTarget: SHADOW_QUALITY_PROFILES[shadowQuality].meshErrorPixels,
  shadowBufferFormat: undefined,
  shadowSunDiscSamples: undefined,
  shadowMsaaSamples: undefined,
  shadowGroundTexelFit: undefined,
});

export const createInitialShadowSimulationState = (
  config: ShadowSimulationConfig | undefined
): ShadowSimulationState => {
  const initialTerrain =
    config?.terrainSources?.[0]?.terrain ?? config?.terrain;
  return {
    enabled: false,
    terrainColor: resolveShadowSurfaceColor(initialTerrain?.material?.color),
    terrainSourceId: initialTerrain?.id,
    terrainQuality: SHADOW_TERRAIN_QUALITY.MAX,
    buildingsFullOpacity: true,
    buildingColorMix: DEFAULT_SHADOW_BUILDING_COLOR_MIX,
    meshTextureSaturation: DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
    buildingColor: DEFAULT_SHADOW_BUILDING_COLOR,
    shadowQuality: DEFAULT_SHADOW_QUALITY,
    shadowAdaptiveQuality: true,
    meshErrorTarget: DEFAULT_MESH_ERROR_TARGET_PIXELS,
    showSunDebugVector: false,
    showTileBounds: false,
    showProjectionDebugView: false,
    showDisplaySettings: false,
    softSunShadows: true,
    showMapStyleContent: true,
    showMapStyleLabels: true,
    useTransmittanceLut: true,
    useSkyIrradianceLut: true,
    controlStyle: SHADOW_CONTROL_STYLE.QUICK,
    animationMode: SHADOW_ANIMATION_MODE.DAY,
    animationSpeed: 4,
    isAnimating: false,
    shadowIntensity: 1,
  };
};

export const createInitialShadowDateState = (
  config: ShadowSimulationConfig | undefined,
  location: SolarLocation,
  instant = new Date()
): ShadowDateState => {
  const timeZone = config?.timeZone ?? DEFAULT_SHADOW_SIMULATION_TIME_ZONE;
  const now = getSolarSelectionForInstant(instant, timeZone);
  const candidate = {
    year: config?.year ?? now.year,
    dayOfYear: config?.initialDayOfYear ?? now.dayOfYear,
    minutes: config?.initialMinutes ?? now.minutes,
    timeZone,
  };

  return (
    clampSelectionToDaylight(candidate, location) ?? {
      ...candidate,
      minutes: 12 * 60,
    }
  );
};
