import type { MappingConfig, MappingConfigLayer } from "@carma-api";

import type { LayerTargets, ShowScene, ShowStory } from "./show";

/** the story a show or draft from before stories gets for all its scenes */
export const FIRST_STORY_ID = "geschichte-1";
export const FIRST_STORY_TITLE = "Geschichte 1";

export type StoryGroup = { story: ShowStory; scenes: ShowScene[] };

type WithScenes = { stories?: ShowStory[]; scenes: ShowScene[] };

/**
 * The stories and scenes as they belong together: at least one story, and
 * every scene in one. A scene without a story, or with one that is gone, goes
 * to the first. Returns `value` itself when nothing had to change.
 */
export const withStories = <T extends WithScenes>(
  value: T
): T & { stories: ShowStory[] } => {
  const stories: ShowStory[] = value.stories?.length
    ? value.stories
    : [{ id: FIRST_STORY_ID, title: FIRST_STORY_TITLE }];
  const ids = new Set(stories.map(({ id }) => id));
  const firstId = stories[0].id;
  let isChanged = stories !== value.stories;
  const scenes = value.scenes.map((scene) => {
    if (scene.story !== undefined && ids.has(scene.story)) {
      return scene;
    }
    isChanged = true;
    return { ...scene, story: firstId };
  });
  return isChanged
    ? { ...value, stories, scenes }
    : (value as T & { stories: ShowStory[] });
};

/** each story with its scenes, in the order of the stories and of the scenes */
export const storyGroups = (value: WithScenes): StoryGroup[] => {
  const { stories, scenes } = withStories(value);
  return stories.map((story) => ({
    story,
    scenes: scenes.filter((scene) => scene.story === story.id),
  }));
};

/**
 * A scene's configuration with its story's base layers under the scene's own
 * layers. A base layer the scene has itself (by id) is left to the scene, so a
 * scene can keep its own opacity for it.
 */
export const baseLayersUnder = (
  config: MappingConfig,
  baseLayers: readonly MappingConfigLayer[] | undefined
): MappingConfig => {
  if (!baseLayers?.length) {
    return config;
  }
  const own = new Set(config.layers.map(({ id }) => id));
  return {
    ...config,
    layers: [...baseLayers.filter(({ id }) => !own.has(id)), ...config.layers],
  };
};

/**
 * The scene's marks with its story's for the base layers it does not have
 * itself (the scene keeps its own, as it keeps its own layer).
 */
const marksUnder = (
  scene: ShowScene,
  story: ShowStory
): { layerTargets?: LayerTargets } => {
  const own = new Set(scene.config.layers.map(({ id }) => id));
  const fromStory = Object.entries(story.layerTargets ?? {}).filter(
    ([id]) =>
      !own.has(id) && (story.baseLayers ?? []).some((layer) => layer.id === id)
  );
  if (fromStory.length === 0) {
    return scene.layerTargets ? { layerTargets: scene.layerTargets } : {};
  }
  return {
    layerTargets: { ...Object.fromEntries(fromStory), ...scene.layerTargets },
  };
};

/**
 * The show as the display is to get it: every scene carrying its story's base
 * layers, and where they go. Returns `value` itself when no story has any.
 */
export const withBaseLayers = <T extends WithScenes>(value: T): T => {
  const shaped = withStories(value);
  const byStory = new Map(shaped.stories.map((story) => [story.id, story]));
  if (![...byStory.values()].some(({ baseLayers }) => baseLayers?.length)) {
    return value;
  }
  return {
    ...shaped,
    scenes: shaped.scenes.map((scene) => {
      const story =
        scene.story !== undefined ? byStory.get(scene.story) : undefined;
      return story?.baseLayers?.length
        ? {
            ...scene,
            config: baseLayersUnder(scene.config, story.baseLayers),
            ...marksUnder(scene, story),
          }
        : scene;
    }),
  };
};
