import { isShow, unpackStored, withStories } from "@carma-mapping/show-remote";

import { normalizeDraft, type ShowDraft } from "./show-draft";

/**
 * The panel's draft saved as a file, to keep a copy of the work or to carry it
 * to another browser. It holds the whole draft, the last publish and its edit
 * token included, so the browser that loads it can still replace the show
 * under the same link.
 */
export const DRAFT_FILE_FORMAT = "carma-pm-show-draft";
export const DRAFT_FILE_VERSION = 1;

export type DraftFile = {
  format: typeof DRAFT_FILE_FORMAT;
  version: typeof DRAFT_FILE_VERSION;
  /** ISO timestamp of the save */
  savedAt: string;
  draft: ShowDraft;
};

export const draftFileOf = (draft: ShowDraft, now: string): DraftFile => ({
  format: DRAFT_FILE_FORMAT,
  version: DRAFT_FILE_VERSION,
  savedAt: now,
  draft,
});

const isDraftFile = (value: unknown): value is DraftFile => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const draft = record["draft"] as Record<string, unknown> | null | undefined;
  return (
    record["format"] === DRAFT_FILE_FORMAT &&
    record["version"] === DRAFT_FILE_VERSION &&
    typeof draft === "object" &&
    draft !== null &&
    Array.isArray(draft["scenes"])
  );
};

/**
 * The draft a loaded file holds: a saved draft as it was, or a published show
 * as ceepr stores it (plain or packed), which comes without a publish, so the
 * next publish makes a new link. Null for anything else.
 */
export const draftFromFile = async (
  value: unknown
): Promise<ShowDraft | null> => {
  const content = await unpackStored(value).catch(() => null);
  if (isDraftFile(content)) {
    return normalizeDraft(content.draft);
  }
  if (isShow(content)) {
    const { stories, scenes } = withStories(content);
    return { title: content.title, stories, scenes };
  }
  return null;
};

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** `<title>_<yyyy-mm-dd>_<hhmm>.json` in local time, without characters file systems refuse */
export const draftFileName = (draft: ShowDraft, at: Date): string => {
  const title = draft.title.trim().replace(/[\\/:*?"<>|]/g, "-") || "show";
  const date = `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(
    at.getDate()
  )}`;
  const time = `${twoDigits(at.getHours())}${twoDigits(at.getMinutes())}`;
  return `${title}_${date}_${time}.json`;
};
