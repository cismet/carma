import { CardinalDirections } from "@carma-geo/data-structures";
import { Easing } from "@carma-commons/math";
import type { Positions } from "@carma-mapping/map-controls-layout";

import type {
  ObliqueBackdropLook,
  ObliqueDataset,
  ObliquePreviewState,
} from "./types";

/** Host controls and an inline or server-owned list of image series. */
export type ObliqueViewerConfig = {
  /** Start the viewer and its panel when the host mounts this addon. */
  startEnabled?: boolean;
  /** Opt into pointer selection and the extended interface; default uses Cesium-style navigation. */
  nextInterface?: boolean;
  /** Catalog referenced by the initial host URL; usable before other enabled series. */
  prioritySeriesId?: string;
  /** Host-owned Geoportal hash adapter; stand-alone viewers need no routing provider. */
  previewState?: {
    initial: ObliquePreviewState | null;
    onChange: (state: ObliquePreviewState | null) => void;
  };
  /** Explicit image series; no imagery or calibration is bundled as a default. */
  series?: readonly ObliqueDataset[];
  /** Server-owned versioned JSON document containing {schemaVersion: 1, series}. */
  seriesConfigURI?: string;
  /**
   * Whether the control column gets a button toggling the viewer. Default:
   * true; the row in the layer bar is the addon's face while it runs, the
   * button is how it is started.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 82 */
  controlOrder?: number;
  /**
   * `localStorage` entry the viewer's state is kept in across reloads.
   * Default: one entry shared by every route (`OBLIQUE_STATE_STORAGE_KEY`).
   */
  storageKey?: string;
  /** metres added to every camera altitude, for fine tuning. Default: 0 */
  heightOffset?: number;
};

/** the MapLibre terrain source the viewer switches on while it runs */
export const DEFAULT_CONTROL_POSITION: Positions = "topleft";
/** geoportal's topleft column: terrain 80, flood 83, time series 85 */
export const DEFAULT_CONTROL_ORDER = 82;

export const BACKDROP_LOOK_DEFAULT: ObliqueBackdropLook = {
  brightness: 125,
  contrast: 95,
  saturation: 85,
};

export const BACKDROP_LOOK_BOUNDS: Record<
  keyof ObliqueBackdropLook,
  [min: number, max: number]
> = {
  brightness: [50, 150],
  contrast: [50, 150],
  saturation: [0, 200],
};

/** Validate explicit series identities and restore named JSON animation curves. */
export const resolveSeries = (
  config: ObliqueViewerConfig | undefined
): ObliqueDataset[] => {
  const series = config?.series ?? [];
  if (!Array.isArray(series)) throw new Error("Image series must be an array.");
  const ids = new Set<string>();
  return series.map((dataset: ObliqueDataset) => {
    if (
      !dataset ||
      typeof dataset.id !== "string" ||
      !dataset.id ||
      ids.has(dataset.id)
    )
      throw new Error("Image series IDs must be nonempty and unique.");
    ids.add(dataset.id);
    if (
      !dataset.cameras ||
      typeof dataset.exteriorOrientationsURI !== "string" ||
      typeof dataset.previewPath !== "string"
    )
      throw new Error("Image series require explicit cameras and asset URLs.");
    if (
      dataset.avifPyramidTemplate !== undefined &&
      (typeof dataset.avifPyramidTemplate !== "string" ||
        !dataset.avifPyramidTemplate.includes("{imageId}"))
    )
      throw new Error(
        "AVIF pyramid template requires an {imageId} placeholder."
      );
    if (dataset.directionalCatalogs !== undefined) {
      const groupIds = new Set<string>();
      if (
        !Array.isArray(dataset.directionalCatalogs) ||
        dataset.directionalCatalogs.length === 0 ||
        dataset.directionalCatalogs.some((group) => {
          if (
            !group ||
            typeof group.id !== "string" ||
            !group.id ||
            groupIds.has(group.id)
          )
            return true;
          groupIds.add(group.id);
          return (
            !(
              group.sector === "nadir" ||
              Object.values(CardinalDirections).some(
                (sector) => sector === group.sector
              )
            ) ||
            !Array.isArray(group.cameraIds) ||
            !group.cameraIds.every((id) => typeof id === "string") ||
            (group.cameraPrefixes !== undefined &&
              (!Array.isArray(group.cameraPrefixes) ||
                !group.cameraPrefixes.every(
                  (prefix) => typeof prefix === "string" && !!prefix
                ))) ||
            (group.obliquePitch !== undefined &&
              (!group.obliquePitch ||
                typeof group.obliquePitch !== "object" ||
                !Number.isFinite(group.obliquePitch.pitchSumRad) ||
                group.obliquePitch.pitchSumRad < 0 ||
                !Number.isSafeInteger(group.obliquePitch.imageCount) ||
                group.obliquePitch.imageCount < 0 ||
                group.obliquePitch.imageCount > group.imageCount ||
                (group.obliquePitch.imageCount === 0 &&
                  group.obliquePitch.pitchSumRad !== 0))) ||
            !Number.isFinite(group.meanHeadingRad) ||
            !Number.isSafeInteger(group.imageCount) ||
            group.imageCount < 0 ||
            typeof group.exteriorOrientationsURI !== "string" ||
            !group.exteriorOrientationsURI ||
            (group.compressedCatalogURI !== undefined &&
              typeof group.compressedCatalogURI !== "string")
          );
        })
      )
        throw new Error(
          "Directional catalogs require unique IDs, camera references, finite headings and asset URLs."
        );
    }
    if (dataset.directionalCatalogPriority !== undefined) {
      const routing = dataset.directionalCatalogPriority;
      const groupIds = new Set(
        dataset.directionalCatalogs?.map((group) => group.id)
      );
      const validRoutes = (value: unknown) =>
        !!value &&
        typeof value === "object" &&
        (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null) &&
        Object.values(value).every(
          (groupId) => typeof groupId === "string" && groupIds.has(groupId)
        );
      if (
        !groupIds.size ||
        !routing ||
        typeof routing !== "object" ||
        !routing.cameraLineParity ||
        !validRoutes(routing.cameraLineParity.EVEN) ||
        !validRoutes(routing.cameraLineParity.ODD) ||
        !validRoutes(routing.imageGroups)
      )
        throw new Error(
          "Directional catalog priority requires routing maps with known group IDs."
        );
    }
    const animations = Object.fromEntries(
      Object.entries(dataset.animations ?? {}).map(([name, animation]) => {
        const easing: unknown = animation?.easingFunction;
        if (typeof easing !== "string") return [name, animation];
        if (!Object.prototype.hasOwnProperty.call(Easing, easing))
          throw new Error("Unknown image-series animation curve.");
        return [
          name,
          {
            ...animation,
            easingFunction: Easing[easing as keyof typeof Easing],
          },
        ];
      })
    );
    return { ...dataset, animations };
  });
};
