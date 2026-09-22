import { useCallback, useEffect, useState } from "react";

import type { ShowScene } from "@carma-mapping/show-remote";

/**
 * The show being put together on the desktop: scenes collect here until they
 * are published. Kept in `localStorage` under the route's scope, so collecting
 * over several sessions works and another route's show is not touched.
 */
export type ShowDraft = {
  title: string;
  scenes: ShowScene[];
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

const EMPTY_DRAFT: ShowDraft = { title: "Projection Mapping", scenes: [] };

const LOG_PREFIX = "[SHOW SCENES]";

const readDraft = (key: string): ShowDraft => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return EMPTY_DRAFT;
    }
    const parsed = JSON.parse(raw) as Partial<ShowDraft>;
    return {
      title:
        typeof parsed.title === "string" ? parsed.title : EMPTY_DRAFT.title,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
      ...(parsed.published ? { published: parsed.published } : {}),
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} stored draft unreadable, starting empty`, error);
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

/** move the scene at `from` by `delta` places, clamped to the list */
export const moveScene = (
  scenes: ShowScene[],
  from: number,
  delta: number
): ShowScene[] => {
  const to = Math.max(0, Math.min(scenes.length - 1, from + delta));
  if (to === from) {
    return scenes;
  }
  const next = [...scenes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
