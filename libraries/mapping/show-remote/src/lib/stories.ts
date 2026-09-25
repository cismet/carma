import type { ShowScene, ShowStory } from "./show";

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
