import type { MappingConfig, MappingConfigLayer } from "@carma-api";
import {
  baseLayersUnder,
  newSceneId,
  sceneHighlights,
  withStories,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import {
  findSpotLayer,
  spotLayerFromHighlights,
  spotLayerHighlights,
} from "../SpotHighlights/spot-layer";
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
 * Takes the layer out of the scene, and out of the scene's own list of what it
 * leaves out, so a copy of it dropped in later starts ticked again.
 */
export const removeSceneLayer = (
  draft: ShowDraft,
  sceneId: string,
  layerId: string
): ShowDraft => {
  const own = draft.excludedLayerIdsByScene?.[sceneId];
  return {
    ...draft,
    scenes: draft.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            config: {
              ...scene.config,
              layers: scene.config.layers.filter(({ id }) => id !== layerId),
            },
          }
        : scene
    ),
    ...(own?.includes(layerId)
      ? {
          excludedLayerIdsByScene: {
            ...draft.excludedLayerIdsByScene,
            [sceneId]: own.filter((id) => id !== layerId),
          },
        }
      : {}),
  };
};

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
 *
 * Its highlights are the spots of its spot layer (`SpotHighlights`), or of its
 * story's when it has none of its own; `baseLayers` are the story's as
 * published. The layer itself goes along too: the display draws nothing for
 * it, and a show opened again for editing gets it back.
 */
export const publishedScene = (
  scene: ShowScene,
  excluded: ReadonlySet<string>,
  baseLayers: readonly MappingConfigLayer[] = []
): ShowScene => {
  const { id, title, story, config, bounds, text } = scene;
  const layers = config.layers.filter((layer) => !excluded.has(layer.id));
  const spotLayer = findSpotLayer(
    baseLayersUnder({ layers }, baseLayers).layers
  );
  const highlights = spotLayer ? spotLayerHighlights(spotLayer) : [];
  return {
    id,
    title,
    ...(story !== undefined ? { story } : {}),
    config: { ...config, layers },
    ...(bounds ? { bounds } : {}),
    ...(text?.trim() ? { text } : {}),
    ...(highlights.length > 0 ? { highlights } : {}),
  };
};

/**
 * A scene with highlights stored on itself, as pm-show kept them before the
 * spot layer, gets them as its spot layer instead, so they can be edited on
 * the map. A scene that has the layer already, itself or in its story's
 * `baseLayers` (a published show opened again), just loses the copy; a copy
 * of the story's layer would hide later edits of it from the scene.
 */
export const withHighlightsAsLayer = (
  scene: ShowScene,
  baseLayers: readonly MappingConfigLayer[] = []
): ShowScene => {
  if (scene.highlights === undefined) {
    return scene;
  }
  const highlights = sceneHighlights(scene);
  const next = { ...scene };
  delete next.highlights;
  if (
    highlights.length === 0 ||
    findSpotLayer(baseLayersUnder(scene.config, baseLayers).layers)
  ) {
    return next;
  }
  return {
    ...next,
    config: {
      ...scene.config,
      layers: [...scene.config.layers, spotLayerFromHighlights(highlights)],
    },
  };
};

/**
 * Whether the configuration names the base map by its entry in the app's own
 * table, which a display with other base maps cannot draw, or switches the
 * base map off, which would take the display's own away. A scene saved now
 * has it as layers instead, see `carma.config.backgroundAsLayers`.
 */
export const hasBaseMapChoice = (config: MappingConfig): boolean =>
  typeof config.backgroundLayer?.selectedLayerId === "string" ||
  config.backgroundLayer?.visible === false;

/**
 * The draft with the base map of every scene saved before as layers of that
 * scene, like one saved now. `asLayers` is `carma.config.backgroundAsLayers`.
 * Returns `draft` itself when no scene changed.
 */
export const withBaseMapsAsLayers = (
  draft: ShowDraft,
  asLayers: (config: MappingConfig) => MappingConfig
): ShowDraft => {
  let isChanged = false;
  const scenes = draft.scenes.map((scene) => {
    if (!hasBaseMapChoice(scene.config)) {
      return scene;
    }
    const config = asLayers(scene.config);
    if (config === scene.config) {
      return scene;
    }
    isChanged = true;
    return { ...scene, config };
  });
  return isChanged ? { ...draft, scenes } : draft;
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

/** the layers every scene of the story is drawn on, see `ShowStory.baseLayers` */
export const storyBaseLayers = (
  draft: ShowDraft,
  storyId: string | undefined
): MappingConfigLayer[] =>
  withStories(draft).stories.find(({ id }) => id === storyId)?.baseLayers ?? [];

/**
 * The map's configuration without the story's base layers, so a scene saved
 * from a map that shows them does not keep a copy of its own.
 */
export const withoutBaseLayers = (
  config: MappingConfig,
  baseLayers: readonly MappingConfigLayer[]
): MappingConfig => {
  if (baseLayers.length === 0) {
    return config;
  }
  const ids = new Set(baseLayers.map(({ id }) => id));
  return {
    ...config,
    layers: config.layers.filter(({ id }) => !ids.has(id)),
  };
};

/** a story without base layers goes without the field, as before they existed */
const withBaseLayerList = (
  story: ShowStory,
  baseLayers: MappingConfigLayer[]
): ShowStory => {
  if (baseLayers.length > 0) {
    return { ...story, baseLayers };
  }
  const next = { ...story };
  delete next.baseLayers;
  return next;
};

const changeStory = (
  draft: ShowDraft,
  storyId: string,
  change: (story: ShowStory) => ShowStory
): ShowDraft => {
  const shaped = withStories(draft);
  return {
    ...shaped,
    stories: shaped.stories.map((story) =>
      story.id === storyId ? change(story) : story
    ),
  };
};

/**
 * Adds layers to the story's base; one the base has already (by id) is
 * replaced where it is, so its place under the others stays.
 */
export const addStoryBaseLayers = (
  draft: ShowDraft,
  storyId: string,
  layers: readonly MappingConfigLayer[]
): ShowDraft =>
  changeStory(draft, storyId, (story) => {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const kept = (story.baseLayers ?? []).map(
      (entry) => byId.get(entry.id) ?? entry
    );
    const known = new Set(kept.map(({ id }) => id));
    return withBaseLayerList(story, [
      ...kept,
      ...[...byId.values()].filter(({ id }) => !known.has(id)),
    ]);
  });

export const removeStoryBaseLayer = (
  draft: ShowDraft,
  storyId: string,
  layerId: string
): ShowDraft =>
  changeStory(draft, storyId, (story) =>
    withBaseLayerList(
      story,
      (story.baseLayers ?? []).filter(({ id }) => id !== layerId)
    )
  );

/**
 * Puts the layer on top of each of the scenes that has no layer of that id
 * yet. `count` is how many scenes got it; with none the draft is returned as
 * it was.
 */
export const copyLayerToScenes = (
  draft: ShowDraft,
  layer: MappingConfigLayer,
  sceneIds: ReadonlySet<string>
): { draft: ShowDraft; count: number } => {
  let count = 0;
  const scenes = draft.scenes.map((scene) => {
    if (
      !sceneIds.has(scene.id) ||
      scene.config.layers.some(({ id }) => id === layer.id)
    ) {
      return scene;
    }
    count++;
    return {
      ...scene,
      config: { ...scene.config, layers: [...scene.config.layers, layer] },
    };
  });
  return count > 0 ? { draft: { ...draft, scenes }, count } : { draft, count };
};

/**
 * A story as the display gets it: without the base layers the whole show
 * leaves out (the outline of the projection area, say). A scene's own
 * "Nicht in der Show" list is about that scene's layers only.
 */
export const publishedStory = (
  story: ShowStory,
  excluded: ReadonlySet<string>
): ShowStory => {
  const { id, title, baseLayers = [] } = story;
  const shown = baseLayers.filter((layer) => !excluded.has(layer.id));
  return { id, title, ...(shown.length > 0 ? { baseLayers: shown } : {}) };
};
