import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "../../lib/registry";
import {
  OBLIQUE_ROTATION_SURFACES,
  OBLIQUE_STATE_DEFAULT,
  type ObliqueViewerState,
} from "@carma-mapping/oblique-viewer";

/**
 * Persistence for the viewer: whether it is on, its title, enabled series and selection policy.
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
  storageKey: string,
  defaults: ObliqueViewerState = OBLIQUE_STATE_DEFAULT
): ObliqueViewerState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    return {
      ...defaults,
      enabledSeriesIds: Array.isArray(parsed.enabledSeriesIds)
        ? parsed.enabledSeriesIds.filter(
            (id): id is string => typeof id === "string"
          )
        : null,
      selectionStrategy: OBLIQUE_STATE_DEFAULT.selectionStrategy,
      rotationSurface:
        parsed.rotationSurface === OBLIQUE_ROTATION_SURFACES.Terrain
          ? OBLIQUE_ROTATION_SURFACES.Terrain
          : OBLIQUE_ROTATION_SURFACES.Surface,
      mapStyle3dEnabled: parsed.mapStyle3dEnabled === true,
      // Preserve the label preference while its optional parent style is off.
      previewBasemapLabels: parsed.previewBasemapLabels !== false,
      previewRotationDrape:
        parsed.previewSeamless !== true &&
        (typeof parsed.previewRotationDrape === "boolean"
          ? parsed.previewRotationDrape
          : defaults.previewRotationDrape),
      previewNavigationMode:
        parsed.previewNavigationMode === "view-center"
          ? "view-center"
          : "image-center",
      previewHoverDrape:
        parsed.previewSeamless !== true &&
        (typeof parsed.previewHoverDrape === "boolean"
          ? parsed.previewHoverDrape
          : defaults.previewHoverDrape),
      previewCenterDebug: parsed.previewCenterDebug === true,
      previewOpticalCenterDebug: parsed.previewOpticalCenterDebug !== false,
      previewScreenCenterDebug: parsed.previewScreenCenterDebug !== false,
      previewPoolDebug: parsed.previewPoolDebug === true,
      previewSeamless: parsed.previewSeamless === true,
      previewSeamlessMode:
        parsed.previewSeamlessMode === "mosaic" ? "mosaic" : "handover",
      previewUprightOnlyWhenCovered:
        parsed.previewUprightOnlyWhenCovered === true,
      previewSeamlessCenterY:
        typeof parsed.previewSeamlessCenterY === "number" &&
        Number.isFinite(parsed.previewSeamlessCenterY)
          ? Math.max(0.1, Math.min(0.9, parsed.previewSeamlessCenterY))
          : OBLIQUE_STATE_DEFAULT.previewSeamlessCenterY,
      lastActiveSeriesId:
        typeof parsed.lastActiveSeriesId === "string" &&
        parsed.lastActiveSeriesId
          ? parsed.lastActiveSeriesId
          : null,
      isOn: parsed.isOn === true,
      title:
        typeof parsed.title === "string" && parsed.title
          ? parsed.title
          : OBLIQUE_STATE_DEFAULT.title,
    };
  } catch (error) {
    console.warn(
      "[ADDON STATE] the stored oblique viewer state is unusable",
      error
    );
    return undefined;
  }
};

export const saveObliqueState = (
  storageKey: string,
  state: ObliqueViewerState
): void => {
  try {
    const {
      isOn,
      title,
      enabledSeriesIds,
      selectionStrategy,
      rotationSurface,
      mapStyle3dEnabled,
      previewBasemapLabels,
      previewRotationDrape,
      previewNavigationMode,
      previewHoverDrape,
      previewCenterDebug,
      previewOpticalCenterDebug,
      previewScreenCenterDebug,
      previewPoolDebug,
      previewSeamless,
      previewSeamlessMode,
      previewUprightOnlyWhenCovered,
      previewSeamlessCenterY,
      lastActiveSeriesId,
    } = state;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        isOn,
        title,
        enabledSeriesIds,
        selectionStrategy,
        rotationSurface,
        mapStyle3dEnabled,
        previewBasemapLabels,
        previewRotationDrape,
        previewNavigationMode,
        previewHoverDrape,
        previewCenterDebug,
        previewOpticalCenterDebug,
        previewScreenCenterDebug,
        previewPoolDebug,
        previewSeamless,
        previewSeamlessMode,
        previewUprightOnlyWhenCovered,
        previewSeamlessCenterY,
        lastActiveSeriesId,
      })
    );
  } catch (error) {
    console.warn(
      "[ADDON STATE] the oblique viewer state could not be stored",
      error
    );
  }
};
