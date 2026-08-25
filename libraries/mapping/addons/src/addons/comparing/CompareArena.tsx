import { useEffect, useMemo, type CSSProperties } from "react";

import { useMapLayers } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { CompareStage } from "./stage/CompareStage";
import { stageHostOf } from "./stage/stage-host";
import { useToolbarInset } from "./stage/useToolbarInset";
import { groupLayers, rolesFromAssignments } from "./stage/roles";
import { useComparingActions } from "./comparing-actions";
import { COMPARE_MODE, type CompareOrientation } from "./compare-modes";
import { panelLabelsFor } from "./panel-labels";

export type CompareArenaConfig = {
  /** glyph endpoint for the panels' own maps, when the app overrides the default */
  overrideGlyphs?: string;
  /**
   * Whether the hidden app map follows every frame (`live`) or only once a
   * movement settles (`settled`, the default). See `CompareSwipe`.
   */
  appMapSync?: "live" | "settled";
  /** the gutter between the windows and around them, in px */
  gap?: number;
  /**
   * Whether the windows are laid out over the whole map area, chrome included.
   *
   * The map area reaches up behind the navbar and the layer bar floats over it,
   * so its top edge is not the top edge of what the user can see.
   *
   * `true`, the default, lays the windows out over all of it and lets the
   * toolbar cover the upper corners of the top row. Nothing then depends on the
   * chrome, so switching it off in zen mode uncovers what was already drawn and
   * not one map has to resize or refetch.
   *
   * `false` keeps the top row clear of the toolbar, which is what makes those
   * corners visible without leaving zen mode. The price is the other way round:
   * every appearance or disappearance of the chrome now resizes every window,
   * and a resized MapLibre map re-renders and refetches.
   *
   * Needs `toolbarSelector` to have anything to keep clear of.
   */
  ignoreToolbar?: boolean;
  /**
   * CSS selector for the chrome over the top of the map, e.g. `"#buttonWrapper"`
   * for the geoportal's layer bar. Only consulted while `ignoreToolbar` is
   * `false`; what is kept clear is everything down to that element's lower edge,
   * so the topmost thing covering the map is the one to name.
   */
  toolbarSelector?: string;
};

/** wide enough to read as a border between two maps, narrow enough to not cost view */
const DEFAULT_GAP = 6;

/** the frame the windows sit in, dark so the gutters read as gaps, not as map */
const FRAME_COLOR = "#111827";

/**
 * Two and three windows along the chosen axis, four as the 2x2 block.
 *
 * The 2x2 is as wide as it is high, so the orientation has nothing left to say
 * about it and is carried past rather than applied.
 */
const arenaShape = (panelCount: number, orientation: CompareOrientation) => {
  if (panelCount === 4) {
    return { columns: 2, rows: 2 };
  }
  const count = Math.max(panelCount, 1);
  return orientation === "vertical"
    ? { columns: 1, rows: count }
    : { columns: count, rows: 1 };
};

/**
 * Compares the layers on the map in windows of their own: up to four maps laid
 * out side by side, each showing the same place at the same zoom and differing
 * only in which layers it was given.
 *
 * Where swipe leaves every panel full-size and clips it, arena gives each one a
 * real box, so a window genuinely is a quarter of the screen. Camera, layer
 * assignment and the hidden app map underneath are the ones the rest of the
 * comparison uses; only the placement is different, which is why this shares
 * `CompareStage` and passes it a grid instead of clip-paths.
 *
 * The centre and zoom are carried over from the app map untouched, so what a
 * window shows is the app map's view rendered into a smaller box: a window
 * covers less ground than the map it came from, at the same scale. Fitting the
 * old bounds into the new boxes instead would keep the area and change the
 * zoom, which is a different comparison and not this one.
 */
export const CompareArena = ({
  config,
  libreMap,
}: AddonComponentProps<"compareArena">) => {
  const { isOn, mode, orientation, panelCount, setLayout, assignments } =
    useComparingActions();
  const isActive = isOn && mode === COMPARE_MODE.arena;

  const layers = useMapLayers(libreMap);
  const roles = useMemo(
    () => rolesFromAssignments(layers, assignments ?? {}, panelCount),
    [assignments, layers, panelCount]
  );
  const groupCount = useMemo(() => groupLayers(layers).length, [layers]);

  const labels = useMemo(
    // the windows sit in reading order along the axis they are laid out on, so
    // the names follow it; four names itself by its corners either way
    () => panelLabelsFor(panelCount, orientation),
    [orientation, panelCount]
  );

  // only the running mode describes the layout, or the pane's headings would be
  // whichever mode addon rendered last
  useEffect(() => {
    if (!isActive) {
      return;
    }
    setLayout(panelCount, labels);
  }, [isActive, labels, panelCount, setLayout]);

  const gap = config?.gap ?? DEFAULT_GAP;
  const { columns, rows } = arenaShape(panelCount, orientation);

  const toolbarInset = useToolbarInset(
    libreMap ? stageHostOf(libreMap) : null,
    config?.toolbarSelector,
    isActive && config?.ignoreToolbar === false
  );

  const containerStyle = useMemo<CSSProperties>(
    () => ({
      display: "grid",
      // `minmax(0, 1fr)` rather than `1fr`: a track's default minimum is its
      // content, and a map that has been given a size would then keep the cell
      // from ever shrinking below it
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      gap,
      padding: gap,
      // the covered strip on top of the gutter, so a window that has been moved
      // clear of the toolbar still keeps the gap the others have
      paddingTop: gap + toolbarInset,
      backgroundColor: FRAME_COLOR,
    }),
    [columns, gap, rows, toolbarInset]
  );

  const panelStyles = useMemo<CSSProperties[]>(
    () =>
      Array.from({ length: panelCount }, () => ({
        // the panel inside fills its box absolutely, so the cell is what gives
        // it its size
        position: "relative" as const,
        overflow: "hidden",
        borderRadius: 4,
      })),
    [panelCount]
  );

  // nothing is mounted while another mode runs, so switching modes tears this
  // stage down and the panels with it. Fewer than two blocks on the map means
  // there is nothing to hold against each other, whatever the assignment says.
  if (!isActive || !libreMap || groupCount < 2 || roles.panels.length < 2) {
    return null;
  }

  return (
    <CompareStage
      appMap={libreMap}
      roles={roles}
      panelStyles={panelStyles}
      containerStyle={containerStyle}
      overrideGlyphs={config?.overrideGlyphs}
      appMapSync={config?.appMapSync}
    />
  );
};
