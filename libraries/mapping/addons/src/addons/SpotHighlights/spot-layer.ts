import type { Layer } from "@carma-mapping/layers";
import {
  DEFAULT_HIGHLIGHT_DIM,
  HIGHLIGHT_DIM_RANGE,
  isShowHighlight,
  type ShowHighlight,
} from "@carma-mapping/show-remote";

import { getToolEntryKind } from "../../lib/tool-entry";

/**
 * The layer that holds highlight spots: circles on the map, everything
 * outside them dimmed, the same look the display gives a scene's highlights.
 *
 * The spots travel inside the row, in its `tools` entry, so whatever copies
 * the layer stack copies them too: a pm-show scene is the stack as
 * `getMappingConfig` returns it, and showing the scene again puts the row
 * back with its spots. The row has no `props`, so no render path of the host
 * takes it for a map layer; the addon draws the spots itself.
 */

export const SPOT_HIGHLIGHTS_LAYER_ID = "__spotHighlights__";

export const SPOT_HIGHLIGHTS_TOOLS_INTERACTION_ID = "spot-highlights-tools";

/** the kind of the row's tools entry, the one that carries the spots */
const SPOT_TOOL_KIND = "spotHighlights";

/** a spot as the layer keeps it; how dark the rest goes is the layer's */
export type Spot = Omit<ShowHighlight, "dim">;

export type SpotLayerContent = {
  spots: Spot[];
  /** how dark everything outside the spots gets, 0 to 1 */
  dim: number;
};

export const EMPTY_SPOT_CONTENT: SpotLayerContent = {
  spots: [],
  dim: DEFAULT_HIGHLIGHT_DIM,
};

/** the row without spots, as the control button adds it */
export const SPOT_HIGHLIGHTS_LAYER: Layer = {
  id: SPOT_HIGHLIGHTS_LAYER_ID,
  title: "Hervorhebungen",
  type: "object",
  icon: "spotHighlights",
  iconColor: "#000000",
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: SPOT_HIGHLIGHTS_TOOLS_INTERACTION_ID,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSpot = (value: unknown): value is Spot =>
  isRecord(value) && isShowHighlight({ ...value, dim: 0 });

export const clampDim = (dim: number): number =>
  Math.min(HIGHLIGHT_DIM_RANGE[1], Math.max(HIGHLIGHT_DIM_RANGE[0], dim));

/**
 * What a row carries. A row without a usable entry carries no spots; a broken
 * spot is dropped rather than the whole row, since a scene is read long after
 * it was written.
 */
export const spotLayerContent = (layer: object): SpotLayerContent => {
  const tools: unknown[] =
    "tools" in layer && Array.isArray(layer.tools) ? layer.tools : [];
  const entry = tools.find((tool) => getToolEntryKind(tool) === SPOT_TOOL_KIND);
  const config = isRecord(entry) && isRecord(entry.config) ? entry.config : {};
  const { spots, dim } = config;
  return {
    spots: Array.isArray(spots) ? spots.filter(isSpot) : [],
    dim:
      typeof dim === "number" && Number.isFinite(dim)
        ? clampDim(dim)
        : DEFAULT_HIGHLIGHT_DIM,
  };
};

/** the row carrying `content`, every other tools entry kept */
export const withSpotLayerContent = <L extends { tools?: unknown }>(
  layer: L,
  content: SpotLayerContent
): L => {
  const tools: unknown[] = Array.isArray(layer.tools) ? layer.tools : [];
  return {
    ...layer,
    tools: [
      ...tools.filter((tool) => getToolEntryKind(tool) !== SPOT_TOOL_KIND),
      { addon: SPOT_TOOL_KIND, config: content },
    ],
  };
};

/** the spot row among `layers`, if there is one */
export const findSpotLayer = <L extends { id: string }>(
  layers: readonly L[]
): L | undefined => layers.find(({ id }) => id === SPOT_HIGHLIGHTS_LAYER_ID);

/** a row's spots as the show's highlights, each with the row's darkness */
export const spotLayerHighlights = (layer: object): ShowHighlight[] => {
  const { spots, dim } = spotLayerContent(layer);
  return spots.map(({ id, title, center, radiusMeters }) => ({
    id,
    title,
    center,
    radiusMeters,
    dim,
  }));
};

/**
 * A row for highlights stored the old way, on the scene itself. They all get
 * the darkest of their dims, since the row has only one.
 */
export const spotLayerFromHighlights = (
  highlights: readonly ShowHighlight[]
): Layer =>
  withSpotLayerContent(SPOT_HIGHLIGHTS_LAYER, {
    spots: highlights.map(({ id, title, center, radiusMeters }) => ({
      id,
      title,
      center,
      radiusMeters,
    })),
    dim:
      highlights.length > 0
        ? clampDim(Math.max(...highlights.map(({ dim }) => dim)))
        : DEFAULT_HIGHLIGHT_DIM,
  });

/** a short fingerprint, to tell whether two contents differ */
export const spotContentSignature = (content: SpotLayerContent): string =>
  JSON.stringify(content);
