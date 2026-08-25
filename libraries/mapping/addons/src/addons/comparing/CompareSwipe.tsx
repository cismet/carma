import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { SwipeOverlay } from "@carma-mapping/core";
import { useMapLayers } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { CompareStage } from "./stage/CompareStage";
import { groupLayers, rolesFromAssignments } from "./stage/roles";
import { useComparingActions } from "./comparing-actions";
import { COMPARE_MODE, SWIPE_MODES } from "./compare-modes";
import { panelLabelsFor } from "./panel-labels";

export type CompareSwipeConfig = {
  /** the orientation the mode starts in; the control pane switches it afterwards */
  orientation?: "horizontal" | "vertical";
  /** glyph endpoint for the panels' own maps, when the app overrides the default */
  overrideGlyphs?: string;
  /**
   * Whether the hidden app map follows every frame (`live`) or only once a
   * movement settles (`settled`, the default). Holding it back saves a render
   * pass per frame that nobody sees; the cost is that the url hash and
   * `carma.mapping2D` only catch up when the movement ends.
   */
  appMapSync?: "live" | "settled";
};

/** evenly spaced splits for n panels: two panels have one split at the middle */
const evenSplits = (panelCount: number) =>
  Array.from({ length: Math.max(panelCount - 1, 0) }, (_, i) => (i + 1) / panelCount);

const pct = (fraction: number) => `${(fraction * 100).toFixed(4)}%`;

/**
 * Stripes along the layout's axis: panel i runs from the split before it to the
 * split after it, the first and last reaching the edge.
 */
const stripeClipPaths = (
  panelCount: number,
  splits: number[],
  orientation: "horizontal" | "vertical"
) =>
  Array.from({ length: panelCount }, (_, index) => {
    const start = index === 0 ? 0 : splits[index - 1] ?? 0;
    const end = index === panelCount - 1 ? 1 : splits[index] ?? 1;
    return orientation === "horizontal"
      ? `inset(0 ${pct(1 - end)} 0 ${pct(start)})`
      : `inset(${pct(start)} 0 ${pct(1 - end)} 0)`;
  });

/** 2x2: panel 0 top left, 1 top right, 2 bottom left, 3 bottom right */
const gridClipPaths = (x: number, y: number) => [
  `inset(0 ${pct(1 - x)} ${pct(1 - y)} 0)`,
  `inset(0 0 ${pct(1 - y)} ${pct(x)})`,
  `inset(${pct(y)} ${pct(1 - x)} 0 0)`,
  `inset(${pct(y)} 0 0 ${pct(x)})`,
];

/**
 * Compares the layers on the map by splitting the window between panels showing
 * the same place, with dividers the user can drag.
 *
 * Two and three panels are stripes along the chosen orientation; four is the
 * 2x2 grid, whose two crossed dividers leave no orientation to choose. The
 * clip-path arithmetic and the crossed-overlay arrangement are the ones
 * `CarmaMapCompare` uses in the playground, so both places split a window the
 * same way.
 *
 * The content is whatever the app's map was given: this reads the layer list
 * back off the map instance (see `mapLayers` in the maplibre engine) and hands
 * each panel the blocks the control pane assigned to it.
 */
export const CompareSwipe = ({
  config,
  libreMap,
}: AddonComponentProps<"compareSwipe">) => {
  const { hasState, isOn, mode, setMode, panelCount, setLayout, assignments } =
    useComparingActions();
  const isGrid = panelCount === 4;
  // another mode is drawing the comparison; this one draws nothing and, more
  // importantly, leaves the layout alone while it is not the one on screen
  const isActive = isOn && SWIPE_MODES.includes(mode);
  const orientation = mode === COMPARE_MODE.swipeV ? "vertical" : "horizontal";
  const layers = useMapLayers(libreMap);
  const roles = useMemo(
    () => rolesFromAssignments(layers, assignments ?? {}, panelCount),
    [assignments, layers, panelCount]
  );
  const groupCount = useMemo(() => groupLayers(layers).length, [layers]);

  const [splits, setSplits] = useState<number[]>(() => evenSplits(2));
  const [gridSplit, setGridSplit] = useState({ x: 0.5, y: 0.5 });

  // the route's config decides which way the divider starts; from then on the
  // mode lives in the shared state, where the control pane can reach it.
  // Only when there is no state to start from: a mode restored from a previous
  // session is a choice that was already made, and seeding over it would send
  // every reload back to swipe.
  const seededMode = useRef(hasState);
  useEffect(() => {
    if (seededMode.current) {
      return;
    }
    seededMode.current = true;
    setMode(
      config?.orientation === "vertical"
        ? COMPARE_MODE.swipeV
        : COMPARE_MODE.swipeH
    );
  }, [config?.orientation, setMode]);

  // a changed panel count means different dividers, and the old positions were
  // about a different number of them
  useEffect(() => {
    setSplits(evenSplits(panelCount));
  }, [panelCount]);

  // Within the swipe modes the panel count decides the geometry: four clipped
  // panels are the 2x2, which has no orientation left to choose, and dropping
  // back below four has to land on one again. Only within them, though: arena
  // draws all four counts itself and must not be corrected into the grid.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    if (isGrid && mode !== COMPARE_MODE.grid) {
      setMode(COMPARE_MODE.grid);
    }
    if (!isGrid && mode === COMPARE_MODE.grid) {
      setMode(COMPARE_MODE.swipeH);
    }
  }, [isActive, isGrid, mode, setMode]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    setLayout(panelCount, panelLabelsFor(panelCount, orientation));
  }, [isActive, orientation, panelCount, setLayout]);

  const clipPaths = useMemo(
    () =>
      isGrid
        ? gridClipPaths(gridSplit.x, gridSplit.y)
        : stripeClipPaths(panelCount, splits, orientation),
    [gridSplit.x, gridSplit.y, isGrid, orientation, panelCount, splits]
  );

  // every panel is full-size and stacked; the clip is the only thing that makes
  // one of them a stripe
  const panelStyles = useMemo<CSSProperties[]>(
    () =>
      clipPaths.map((clipPath) => ({
        position: "absolute" as const,
        inset: 0,
        clipPath,
        WebkitClipPath: clipPath,
      })),
    [clipPaths]
  );

  // nothing is mounted while the mode is off, so the app map is untouched and
  // no second map exists until the user actually asks for the comparison.
  // Fewer than two blocks on the map means there is nothing to hold against
  // each other, whatever the assignment says.
  if (!isActive || !libreMap || groupCount < 2 || roles.panels.length < 2) {
    return null;
  }

  return (
    <CompareStage
      appMap={libreMap}
      roles={roles}
      panelStyles={panelStyles}
      overrideGlyphs={config?.overrideGlyphs}
      appMapSync={config?.appMapSync}
    >
      {isGrid ? (
        <>
          <SwipeOverlay
            orientation="horizontal"
            positions={[gridSplit.x]}
            onPositionsChange={([x]) =>
              setGridSplit((previous) => ({ ...previous, x }))
            }
          />
          <SwipeOverlay
            orientation="vertical"
            positions={[gridSplit.y]}
            onPositionsChange={([y]) =>
              setGridSplit((previous) => ({ ...previous, y }))
            }
          />
        </>
      ) : (
        <SwipeOverlay
          orientation={orientation}
          positions={splits}
          onPositionsChange={setSplits}
        />
      )}
    </CompareStage>
  );
};
