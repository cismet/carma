import { createElement, type FunctionComponent } from "react";

import type { Map as MapLibreMap } from "maplibre-gl";

import { useFeatureFlags } from "@carma-providers/feature-flag";
import type { Positions } from "@carma-mapping/map-controls-layout";

/**
 * Bridge to the addons implemented in the closed-source cage repo.
 *
 * carma is public, cage is private, so cage is absent in any checkout without
 * credentials: forks, external contributors, and CI runs that get no secrets.
 * Importing `@carma-cage/*` directly would make those builds fail to resolve,
 * so the import goes through `import.meta.glob` instead, which yields an empty
 * object when the file is not there rather than erroring.
 *
 * Everything exported here is therefore optional at runtime. `AddonHost`
 * already renders nothing for a registry entry whose `Component` is undefined,
 * so an absent cage degrades to "the addon does nothing" with no extra guards
 * at the call sites.
 *
 * The config types live here, in the open, on purpose: `AddonConfigMap` is part
 * of carma's public surface and has to typecheck without cage present. Only the
 * implementations are caged. `CageIndicatorBadgeConfig` is mirrored in cage's
 * `src/mapping-addons/CageIndicatorBadge.tsx`; the two are matched structurally.
 */

export type CageIndicatorBadgeConfig = {
  /** Corner the badge is registered in. Default: "bottomleft" */
  position?: Positions;
  /** Sort order within that corner. Default: 100 */
  order?: number;
};

// FunctionComponent rather than ComponentType: the latter includes
// ComponentClass, whose props are invariant, so a component declaring only
// `config` would not satisfy `ComponentType<AddonComponentProps<K>>` in the
// registry. Function props are contravariant, so the narrower shape is fine.
/**
 * Options for the caged WMS crossfade. Mirrored here rather than imported: the
 * type has to exist in a checkout without cage, same reason as the config types
 * above. Matched structurally against cage's `WmsBlend/createBlendLayer.ts`.
 */
export type BlendLayerOptions = {
  map: MapLibreMap;
  /** base url, everything up to and including `?SERVICE=WMS` */
  wmsUrl: string;
  /** one layer name per time step, in order */
  layers: string[];
  styles: string;
  /** sub-steps between two WMS time steps; the slider counts in these */
  intermediateValuesCount?: number;
  format?: string;
  version?: string;
  transparent?: boolean;
  srs?: string;
  opacity?: number;
  /**
   * Linear factor by which every frame is fetched larger than the viewport,
   * so a pan inside the margin needs no refetch. Default: 1.5
   */
  viewportBuffer?: number;
  beforeId?: string;
  id?: string;
  onFrameLoaded?: (loaded: number, total: number) => void;
  /**
   * Every cached frame was dropped and the series is being fetched again, which
   * a pan, a zoom or a resize does. Fires before the first new frame is asked
   * for, so a progress readout falls back to zero as the map goes blank.
   */
  onFramesReset?: (total: number) => void;
  onError?: (index: number, error: unknown) => void;
};

/** What the caged layer hands back. Lifecycle out, one position in. */
export type BlendLayerHandle = {
  setPosition: (position: number) => void;
  getMaxPosition: () => number;
  setOpacity: (opacity: number) => void;
  /** hide without teardown; the frame cache keeps following the viewport */
  setVisible: (visible: boolean) => void;
  getLoadedCount: () => number;
  destroy: () => void;
};

/**
 * How a model's u and v components map onto eastward and northward.
 *
 * Which way round they are written depends on the simulation's result file, so
 * it travels with the scenario. The Leaflet rain hazard map carries the same
 * value under the same name, defaulting to `{ u: -1, v: -1 }`.
 */
export type UvCorrection = { u: number; v: number };

/**
 * One row of the animation's per-zoom profile: the alpha every drawn pixel
 * keeps per frame, and how many frames a particle runs before it is reborn
 * elsewhere. Same numbers as the Leaflet rain hazard map's `settingsForZoom`,
 * keyed by MapLibre zoom, which is the Leaflet zoom minus one.
 */
export type FlowFieldZoomProfileEntry = {
  zoom: number;
  fade: number;
  maxAge: number;
};

/**
 * Knobs for the caged particle animation. All optional; cage's defaults are
 * the Leaflet app's.
 */
export type FlowFieldParams = {
  /** particles per square root of the viewport's ground area in m². Default 8 */
  pathFactor?: number;
  /** screen pixels per second a particle moves per m/s of flow. Default 36 */
  speed?: number;
  /** stroke width in CSS pixels. Default 1 */
  width?: number;
  /** stroke colour. Default `#326C88` */
  color?: string;
  /** fade and lifetime by zoom, interpolated between rows */
  profile?: FlowFieldZoomProfileEntry[];
};

/**
 * Options for the caged flow-field animation. Mirrored rather than imported,
 * same reason as the types above. Matched structurally against cage's
 * `FlowFieldParticles/createFlowLayer.ts`.
 */
export type FlowLayerOptions = {
  map: MapLibreMap;
  /** rasterfari base, e.g. `https://rain-rasterfari-wuppertal.cismet.de` */
  service: string;
  /** scenario folder, the rain hazard map config's `animation` value */
  scenario: string;
  layerPostfix?: string;
  uvCorrection?: UvCorrection;
  /**
   * MapLibre zoom at or above which the animation runs; below it nothing is
   * fetched or drawn. Default 16, which is the Leaflet app's zoom 17.
   */
  minZoom?: number;
  /**
   * Whether the particles keep running while the map pans, zooms or tilts.
   * Default true; false pauses them at `movestart` and brings them back once
   * the map has settled, the Leaflet behaviour.
   */
  animateWhileMoving?: boolean;
  /** linear factor by which the fetched box exceeds the viewport */
  viewportBuffer?: number;
  /** quiet time after a map move before a request goes out */
  debounceMs?: number;
  params?: FlowFieldParams;
  /** class name of the overlay canvas */
  id?: string;
  /** the zoom gate opened or closed */
  onActiveChange?: (active: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
  onRasterLoaded?: (info: {
    width: number;
    height: number;
    /** share of cells carrying data, 0..1 */
    coverage: number;
  }) => void;
  onError?: (error: unknown) => void;
};

/** What the caged particle layer hands back. */
export type FlowLayerHandle = {
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setParams: (params: FlowFieldParams) => void;
  isActive: () => boolean;
  getStats: () => {
    count: number;
    meanSpeed: number;
    maxSpeed: number;
  } | null;
  destroy: () => void;
};

type CagedMappingAddons = {
  CageIndicatorBadge?: FunctionComponent<{ config?: CageIndicatorBadgeConfig }>;
  createBlendLayer?: (options: BlendLayerOptions) => BlendLayerHandle;
  createFlowLayer?: (options: FlowLayerOptions) => FlowLayerHandle;
};

// Exact path rather than a wildcard: this is a single known entry point, and an
// eager glob of one file keeps the absent case to an empty record.
const modules = import.meta.glob<CagedMappingAddons>(
  "../../../../../cage/cage-submodule/src/mapping-addons/index.ts",
  { eager: true }
);

const caged: CagedMappingAddons = Object.values(modules)[0] ?? {};

/**
 * Feature flag that makes a checkout *with* cage behave like one without it.
 *
 * The fallbacks are the half of this bridge nobody sees while developing, since
 * a developer with credentials always has cage linked in. The flag is how they
 * get looked at without unlinking the submodule and restarting the dev server.
 * The host app decides the url alias; the geoportal's is `#/...?ff=nocage`.
 *
 * A build genuinely without cage ignores the flag: everything below is already
 * undefined there, so switching it on changes nothing.
 */
export const NO_CAGE_FLAG = "featureFlagNoCage";

/** Whether this session is pretending cage is absent. */
export const useCageDisabled = (): boolean =>
  Boolean(useFeatureFlags()[NO_CAGE_FLAG]);

const cagedIndicatorBadge = caged.CageIndicatorBadge;

/**
 * The badge saying cage is linked in. Undefined without cage, and it renders
 * nothing while the flag pretends cage is absent, so the flag is visible on
 * screen rather than only in what the addons do.
 */
const CageIndicatorBadgeWithFlag: FunctionComponent<{
  config?: CageIndicatorBadgeConfig;
}> = (props) => {
  const disabled = useCageDisabled();
  return disabled || !cagedIndicatorBadge
    ? null
    : createElement(cagedIndicatorBadge, props);
};

export const CageIndicatorBadge: CagedMappingAddons["CageIndicatorBadge"] =
  cagedIndicatorBadge ? CageIndicatorBadgeWithFlag : undefined;

/**
 * Smooth crossfade between WMS time steps. Undefined without cage, and the
 * `timeSlider` addon then falls back to a plain tiled WMS layer that snaps to
 * whole steps, so the absence costs the interpolation and nothing else.
 *
 * Prefer `useCreateBlendLayer` in a component: it is this value with the
 * no-cage flag applied.
 */
export const createBlendLayer = caged.createBlendLayer;

/** `createBlendLayer`, or undefined while the no-cage flag is on. */
export const useCreateBlendLayer = (): typeof createBlendLayer =>
  useCageDisabled() ? undefined : createBlendLayer;

/**
 * The flow-field particle animation over a Starkregen velocity field.
 * Undefined without cage, and unlike the crossfade there is no fallback: the
 * `flowField` addon then mounts nothing and the map simply has no animation.
 *
 * Prefer `useCreateFlowLayer` in a component.
 */
export const createFlowLayer = caged.createFlowLayer;

/** `createFlowLayer`, or undefined while the no-cage flag is on. */
export const useCreateFlowLayer = (): typeof createFlowLayer =>
  useCageDisabled() ? undefined : createFlowLayer;

/** Whether the caged implementations were compiled into this build. */
export const isCagedAvailable = Boolean(cagedIndicatorBadge);

/** The same, with the no-cage flag applied: what an addon should branch on. */
export const useIsCagedAvailable = (): boolean => {
  // read first: `isCagedAvailable && !useCageDisabled()` would short-circuit
  // the hook away in a build without cage
  const disabled = useCageDisabled();
  return isCagedAvailable && !disabled;
};
