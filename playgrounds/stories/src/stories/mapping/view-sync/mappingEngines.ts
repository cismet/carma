import { CARMA_MAP_FRAMEWORKS } from "@carma-mapping/components";

export const CARMA_STORY_MAPPING_ENGINES = {
  ...CARMA_MAP_FRAMEWORKS,
  MAPLIBRE_GL: "maplibre-gl",
} as const;

export type StoryMappingEngine =
  (typeof CARMA_STORY_MAPPING_ENGINES)[keyof typeof CARMA_STORY_MAPPING_ENGINES];

export const STORY_MAPPING_ENGINE_OPTIONS: StoryMappingEngine[] = [
  CARMA_STORY_MAPPING_ENGINES.CESIUM,
  CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL,
  CARMA_STORY_MAPPING_ENGINES.LEAFLET,
];
