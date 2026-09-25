import { useCallback, useEffect, useState } from "react";

import {
  withStories,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

/**
 * The show being put together on the desktop: scenes collect here until they
 * are published. Kept in `localStorage` under the route's scope, so collecting
 * over several sessions works and another route's show is not touched.
 */
export type ShowDraft = {
  title: string;
  /** the folders the scenes are in, see `withStories`; never empty once read */
  stories?: ShowStory[];
  scenes: ShowScene[];
  /**
   * Layer ids a publish leaves out of every scene. Absent until the panel's
   * list is first changed; until then the addon config's `excludeLayers`
   * applies.
   */
  excludedLayerIds?: string[];
  /**
   * Per scene id, the layers a publish leaves out of that scene. A scene
   * without an entry uses `excludedLayerIds`, or the addon config's list.
   */
  excludedLayerIdsByScene?: Record<string, string[]>;
  /**
   * The last publish, so its link stays at hand after a reload, and the token
   * that lets the next publish replace the show under the same key. Only this
   * browser has the token; publishing from another one makes a new link.
   */
  published?: {
    key: string;
    at: string;
    sceneCount: number;
    /** what was published, to tell when the list has changed since */
    fingerprint?: string;
    /** absent on a publish from before shows could be replaced */
    editToken?: string;
  };
};

export const SHOW_DRAFT_STORAGE_PREFIX = "carma::showScenes";

const EMPTY_DRAFT: ShowDraft = withStories({
  title: "Projection Mapping",
  scenes: [],
});

const LOG_PREFIX = "[SHOW SCENES]";

const readDraft = (key: string): ShowDraft => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return EMPTY_DRAFT;
    }
    const parsed = JSON.parse(raw) as Partial<ShowDraft>;
    // a draft from before stories gets one for all its scenes
    return withStories({
      title:
        typeof parsed.title === "string" ? parsed.title : EMPTY_DRAFT.title,
      ...(Array.isArray(parsed.stories) ? { stories: parsed.stories } : {}),
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
      ...(Array.isArray(parsed.excludedLayerIds)
        ? {
            excludedLayerIds: parsed.excludedLayerIds.filter(
              (id): id is string => typeof id === "string"
            ),
          }
        : {}),
      ...(parsed.excludedLayerIdsByScene &&
      typeof parsed.excludedLayerIdsByScene === "object"
        ? { excludedLayerIdsByScene: parsed.excludedLayerIdsByScene }
        : {}),
      ...(parsed.published ? { published: parsed.published } : {}),
    });
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} stored draft unreadable, starting empty`,
      error
    );
    return EMPTY_DRAFT;
  }
};

export const useShowDraft = (
  storageKey: string
): [ShowDraft, (update: (draft: ShowDraft) => ShowDraft) => void] => {
  const [draft, setDraft] = useState<ShowDraft>(() => readDraft(storageKey));

  useEffect(() => {
    setDraft(readDraft(storageKey));
  }, [storageKey]);

  const update = useCallback(
    (change: (draft: ShowDraft) => ShowDraft) => {
      setDraft((current) => {
        const next = change(current);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (error) {
          // a full storage loses the draft on reload, the session keeps it
          console.warn(`${LOG_PREFIX} storing the draft failed`, error);
        }
        return next;
      });
    },
    [storageKey]
  );

  return [draft, update];
};
