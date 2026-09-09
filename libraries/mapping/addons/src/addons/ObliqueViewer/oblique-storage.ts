import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "../../lib/registry";
import {
  OBLIQUE_STATE_DEFAULT,
  resolveBackdropLook,
  type ObliqueViewerState,
} from "./oblique-actions";

/**
 * Persistence for the viewer: whether it is on, and how the preview looks.
 *
 * The addon state map is session-only, so this channel is mirrored into
 * `localStorage` and seeded from there on the next load, the way the flood
 * and the comparison keep theirs (README, "Workflow tools"). What the engine
 * reports at runtime, the selected image, the sector, a flight in progress,
 * and what the host owns, whether the ribbon is open, is not restored; both
 * are published again as soon as the pieces mount.
 */

const ENGINE_KIND: AddonKind = "obliqueViewer";

export const OBLIQUE_STATE_STORAGE_KEY = "carma::obliqueViewerState";

/**
 * The key this route stores under: its own, when the `obliqueViewer` entry
 * names one, and the shared default otherwise.
 */
export const obliqueStateStorageKey = (
  addons?: readonly AddonEntry[]
): string => {
  const engine = normalizeAddonEntries(addons).find(
    ({ kind }) => kind === ENGINE_KIND
  );
  const configured =
    engine?.kind === ENGINE_KIND ? engine.config?.storageKey : undefined;
  return configured || OBLIQUE_STATE_STORAGE_KEY;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const loadObliqueState = (
  storageKey: string
): ObliqueViewerState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    return {
      ...OBLIQUE_STATE_DEFAULT,
      isOn: parsed.isOn === true,
      title:
        typeof parsed.title === "string" && parsed.title
          ? parsed.title
          : OBLIQUE_STATE_DEFAULT.title,
      previewQuality: parsed.previewQuality === "hq" ? "hq" : "standard",
      backdropLook: resolveBackdropLook(
        isRecord(parsed.backdropLook)
          ? (parsed.backdropLook as Partial<ObliqueViewerState["backdropLook"]>)
          : undefined
      ),
    };
  } catch (error) {
    console.warn("[ADDON STATE] the stored oblique viewer state is unusable", error);
    return undefined;
  }
};

export const saveObliqueState = (
  storageKey: string,
  state: ObliqueViewerState
): void => {
  try {
    const { isOn, title, previewQuality, backdropLook } = state;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ isOn, title, previewQuality, backdropLook })
    );
  } catch (error) {
    console.warn("[ADDON STATE] the oblique viewer state could not be stored", error);
  }
};
