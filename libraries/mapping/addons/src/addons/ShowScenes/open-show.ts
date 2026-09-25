import { withStories, type Show } from "@carma-mapping/show-remote";

import type { ShowDraft } from "./show-draft";

/**
 * The key of a published show from what was typed or pasted into the panel:
 * the key itself, or a remote link that names it in `?show=`. Null when there
 * is nothing to open.
 */
export const showKeyFrom = (input: string): string | null => {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (!/^https?:\/\//i.test(text)) {
    return /\s/.test(text) ? null : text;
  }
  try {
    return new URL(text).searchParams.get("show")?.trim() || null;
  } catch {
    return null;
  }
};

/**
 * The draft a published show becomes when it is opened by its key.
 *
 * Its scenes are the published ones, so whatever a publish leaves out of a
 * scene is not in them, and nothing else of the replaced draft is kept. The
 * show stays the draft's published one, so its link is at hand again.
 *
 * The edit token that lets a publish replace it under the same key comes along
 * only when this browser published that key; from any other the next publish
 * makes a new link.
 *
 * `fingerprint` is left to the caller, which knows how a draft is compared.
 */
export const draftFromShow = (
  show: Show,
  key: string,
  current: ShowDraft,
  now: string
): ShowDraft => {
  const editToken =
    current.published?.key === key ? current.published.editToken : undefined;
  // a show from before stories gets one for all its scenes
  const { stories, scenes } = withStories(show);
  return {
    title: show.title,
    stories,
    scenes,
    published: {
      key,
      // older shows may come without it
      at: typeof show.publishedAt === "string" ? show.publishedAt : now,
      sceneCount: show.scenes.length,
      ...(editToken ? { editToken } : {}),
    },
  };
};
