import { useCallback, useEffect, useState } from "react";

import {
  withStories,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import { withHighlightsAsLayer } from "./scene-edit";

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

/**
 * A draft from what was stored or loaded, with the parts it lacks filled in.
 * A draft from before stories gets one for all its scenes, one from before
 * the spot layer gets its scenes' highlights as that layer.
 */
export const normalizeDraft = (parsed: Partial<ShowDraft>): ShowDraft =>
  withStories({
    title: typeof parsed.title === "string" ? parsed.title : EMPTY_DRAFT.title,
    ...(Array.isArray(parsed.stories) ? { stories: parsed.stories } : {}),
    scenes: Array.isArray(parsed.scenes)
      ? parsed.scenes.map((scene) => withHighlightsAsLayer(scene))
      : [],
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

const readDraft = (key: string): ShowDraft => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return EMPTY_DRAFT;
    }
    return normalizeDraft(JSON.parse(raw) as Partial<ShowDraft>);
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} stored draft unreadable, starting empty`,
      error
    );
    return EMPTY_DRAFT;
  }
};

/**
 * Whether the panel is open, kept next to the draft so a reload opens it again
 * where it was open.
 */
export const useStoredPanelOpen = (
  storageKey: string
): [boolean, (update: boolean | ((isOpen: boolean) => boolean)) => void] => {
  const key = `${storageKey}::open`;
  const [isOpen, setIsOpen] = useState(
    () => window.localStorage.getItem(key) === "true"
  );

  const update = useCallback(
    (change: boolean | ((isOpen: boolean) => boolean)) =>
      setIsOpen((current) => {
        const next = typeof change === "function" ? change(current) : change;
        try {
          window.localStorage.setItem(key, String(next));
        } catch (error) {
          console.warn(`${LOG_PREFIX} storing the panel state failed`, error);
        }
        return next;
      }),
    [key]
  );

  return [isOpen, update];
};

/** the stored ids, or none when the entry is missing or not a list of ids */
const readCollapsedStoryIds = (key: string): ReadonlySet<string> => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(key) ?? "[]"
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : []
    );
  } catch {
    return new Set();
  }
};

/**
 * The stories collapsed in the panel, kept next to the draft so a reload
 * shows them the way they were. Not in the draft: the publish fingerprint
 * ignores it. A story not in the list is open, so a new one comes up open.
 */
export const useStoredCollapsedStories = (
  storageKey: string
): [
  ReadonlySet<string>,
  (change: (ids: ReadonlySet<string>) => ReadonlySet<string>) => void
] => {
  const key = `${storageKey}::collapsed`;
  const [ids, setIds] = useState(() => readCollapsedStoryIds(key));

  const update = useCallback(
    (change: (ids: ReadonlySet<string>) => ReadonlySet<string>) =>
      setIds((current) => {
        const next = change(current);
        if (next !== current) {
          try {
            window.localStorage.setItem(key, JSON.stringify([...next]));
          } catch (error) {
            console.warn(
              `${LOG_PREFIX} storing the collapsed stories failed`,
              error
            );
          }
        }
        return next;
      }),
    [key]
  );

  return [ids, update];
};

/**
 * The relay code of the display the phone should drive (`#/outlet?relay=`),
 * kept next to the draft. Not in the draft: it names a display, not the show,
 * so it neither travels with a publish nor counts for the fingerprint.
 */
export const useStoredRelayCode = (
  storageKey: string
): [string, (code: string) => void] => {
  const key = `${storageKey}::relay`;
  const [code, setCode] = useState(
    () => window.localStorage.getItem(key) ?? ""
  );

  const update = useCallback(
    (next: string) => {
      setCode(next);
      try {
        window.localStorage.setItem(key, next);
      } catch (error) {
        console.warn(`${LOG_PREFIX} storing the relay code failed`, error);
      }
    },
    [key]
  );

  return [code, update];
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
