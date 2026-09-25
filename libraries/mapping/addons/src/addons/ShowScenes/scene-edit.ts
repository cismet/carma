import type { MappingConfigLayer } from "@carma-api";
import {
  newSceneId,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import type { ShowDraft } from "./show-draft";

/**
 * The parts of the Show-Szenen panel that need no React: which layers a scene
 * leaves out, how a scene goes into the published show, and small list edits.
 */

/** move the entry at `from` by `delta` places, clamped to the list */
export const moveEntry = <T>(
  entries: T[],
  from: number,
  delta: number
): T[] => {
  const to = Math.max(0, Math.min(entries.length - 1, from + delta));
  if (to === from) {
    return entries;
  }
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * The layers a scene leaves out of the show: its own list once it has one,
 * otherwise the list every scene starts with.
 */
export const sceneExclusion = (
  draft: ShowDraft,
  sceneId: string,
  initial: readonly string[]
): Set<string> => new Set(draft.excludedLayerIdsByScene?.[sceneId] ?? initial);

export const setSceneLayerExcluded = (
  draft: ShowDraft,
  sceneId: string,
  layerId: string,
  excluded: boolean,
  initial: readonly string[]
): ShowDraft => {
  const ids = sceneExclusion(draft, sceneId, initial);
  if (excluded) {
    ids.add(layerId);
  } else {
    ids.delete(layerId);
  }
  return {
    ...draft,
    excludedLayerIdsByScene: {
      ...draft.excludedLayerIdsByScene,
      [sceneId]: [...ids],
    },
  };
};

/** every layer the scene puts on the map */
export const sceneLayers = (scene: ShowScene): MappingConfigLayer[] =>
  scene.config.layers;

/**
 * Gives every scene the source scene's choice for the source scene's layers.
 * A layer the source scene does not have keeps whatever each scene says
 * about it.
 */
export const applyExclusionToAll = (
  draft: ShowDraft,
  sourceId: string,
  initial: readonly string[]
): ShowDraft => {
  const source = draft.scenes.find(({ id }) => id === sourceId);
  if (!source) {
    return draft;
  }
  const sourceExcluded = sceneExclusion(draft, sourceId, initial);
  const layerIds = sceneLayers(source).map(({ id }) => id);
  const byScene = { ...draft.excludedLayerIdsByScene };
  for (const scene of draft.scenes) {
    const excluded = sceneExclusion(draft, scene.id, initial);
    for (const id of layerIds) {
      if (sourceExcluded.has(id)) {
        excluded.add(id);
      } else {
        excluded.delete(id);
      }
    }
    byScene[scene.id] = [...excluded];
  }
  return { ...draft, excludedLayerIdsByScene: byScene };
};

/**
 * A scene as the display gets it: without the layers it leaves out. Only the
 * fields of the show format go along, so an older draft's leftovers (the
 * subscene controls of a dropped design) stay on the desktop, and an empty
 * text stays out.
 */
export const publishedScene = (
  scene: ShowScene,
  excluded: ReadonlySet<string>
): ShowScene => {
  const { id, title, story, config, bounds, text } = scene;
  return {
    id,
    title,
    ...(story !== undefined ? { story } : {}),
    config: {
      ...config,
      layers: config.layers.filter((layer) => !excluded.has(layer.id)),
    },
    ...(bounds ? { bounds } : {}),
    ...(text?.trim() ? { text } : {}),
  };
};

/**
 * Moves a scene up or down among the scenes of its own story; the scenes of
 * the other stories stay where they are in the list.
 */
export const moveSceneInStory = (
  scenes: ShowScene[],
  sceneId: string,
  delta: number
): ShowScene[] => {
  const scene = scenes.find(({ id }) => id === sceneId);
  if (!scene) {
    return scenes;
  }
  const places = scenes.flatMap((entry, index) =>
    entry.story === scene.story ? [index] : []
  );
  const from = places.findIndex((index) => scenes[index].id === sceneId);
  const to = Math.max(0, Math.min(places.length - 1, from + delta));
  if (to === from) {
    return scenes;
  }
  const next = [...scenes];
  next[places[from]] = scenes[places[to]];
  next[places[to]] = scene;
  return next;
};

/** puts a scene into another story, as that story's last scene */
export const moveSceneToStory = (
  scenes: ShowScene[],
  sceneId: string,
  storyId: string
): ShowScene[] => {
  const scene = scenes.find(({ id }) => id === sceneId);
  if (!scene || scene.story === storyId) {
    return scenes;
  }
  return [
    ...scenes.filter(({ id }) => id !== sceneId),
    { ...scene, story: storyId },
  ];
};

export const newStory = (number: number): ShowStory => ({
  id: newSceneId(),
  title: `Geschichte ${number}`,
});

/** removes a story with its scenes and what the draft says about them */
export const deleteStory = (draft: ShowDraft, storyId: string): ShowDraft => {
  const gone = new Set(
    draft.scenes.filter(({ story }) => story === storyId).map(({ id }) => id)
  );
  const byScene = draft.excludedLayerIdsByScene;
  return {
    ...draft,
    stories: (draft.stories ?? []).filter(({ id }) => id !== storyId),
    scenes: draft.scenes.filter(({ id }) => !gone.has(id)),
    ...(byScene
      ? {
          excludedLayerIdsByScene: Object.fromEntries(
            Object.entries(byScene).filter(([id]) => !gone.has(id))
          ),
        }
      : {}),
  };
};
