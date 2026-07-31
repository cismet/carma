import { useMemo, useRef } from "react";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";
import type { LayerStatsGroup, MarkShape } from "./VisibleFeatureStatsSource";

/**
 * The readout for what `VisibleFeatureStatsSource` publishes on the
 * `visibleFeatureStats` channel: a proportion bar and a per-category list of
 * what is currently on screen, registered into the host's control layout.
 *
 * Knows nothing about maps. It reads one channel, picks the colours (the
 * palette is presentation, so it lives here and not in the producer) and draws
 * — which is what makes it replaceable: a route could swap in a different
 * consumer of the same channel without touching the query side.
 *
 * Without the source configured alongside it the channel stays empty and the
 * panel reads as still-loading; `AddonHost` warns about that pairing in dev,
 * off the `provides`/`requires` declarations in the registry.
 */

export type VisibleFeatureStatsPanelConfig = {
  /** Corner the panel is registered in. Default: "topright" */
  position?: Positions;
  /** Sort order within that corner. Default: 10 */
  order?: number;
  /** Layer rows shown before the rest is folded into a "+n" line. Default: 8 */
  maxRows?: number;
};

const DEFAULT_POSITION: Positions = "topright";
const DEFAULT_ORDER = 10;
const DEFAULT_MAX_ROWS = 8;

/**
 * The geoportal body stack (`apps/geoportal/src/app/index.css`). Set explicitly
 * instead of relying on inheritance so the panel reads the same in a story, in
 * BELIS, or in any host that ships a different body font.
 */
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

/**
 * Categorical slots, validated against a white surface: every adjacent pair
 * keeps ΔE ≥ 8 (OKLab ×100) under protanopia/deuteranopia/tritanopia, so
 * neighbouring rows and neighbouring bar segments stay tellable apart. Three of
 * them sit below 3:1 contrast on white, which is why every swatch is paired
 * with a written label and a number — colour never carries a value alone.
 *
 * Assigned per group key in first-seen order (`useStableSeriesColors`), never
 * by rank: rows are sorted by count, and panning reorders them, so a rank-based
 * palette would repaint a group the reader has already learned.
 */
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

/** folded-away sources, and any group past the eighth slot */
const REST_COLOR = "#c3c2b7";

const INK = {
  /** heading — the deepest step of the same blue ramp slot 1 comes from */
  title: "#0d366b",
  primary: "#0b0b0b",
  secondary: "#52514e",
  /** empty proportion bar */
  track: "#e1e0d9",
};

const formatCount = new Intl.NumberFormat("de-DE").format;

/** swatch width + row gap, so child rows line up under their parent's label */
const CHILD_INDENT_PX = 19;

/** a group with its swatch colour resolved, see `useStableSeriesColors` */
export type ColoredStatsGroup = LayerStatsGroup & { color: string };

/**
 * Legend mark. The shape repeats the geometry the group is drawn with, so it is
 * a second, non-colour channel for identity: filled square for areas, dot for
 * points, short rule for lines.
 */
const Swatch = ({ shape, color }: { shape: MarkShape; color: string }) => (
  <span
    aria-hidden
    className={
      shape === "line"
        ? "h-[3px] w-[10px] shrink-0 rounded-full"
        : `h-[9px] w-[9px] shrink-0 ${
            shape === "point" ? "rounded-full" : "rounded-[2px]"
          }`
    }
    style={{ backgroundColor: color }}
  />
);

/**
 * Presentational half: props in, markup out. No map, no channel, no hooks — so
 * it can be rendered from a story or a test without a MapLibre instance, and
 * restyled without touching the query logic in the source addon.
 *
 * Deliberately stateless: `Control` re-registers its children on every render
 * (its effect deps are `[children]`, and JSX children are a fresh object each
 * time), so anything held in local state here would be reset on every pan.
 */
export const StatsReadout = ({
  totalCount,
  groups,
  isLoading,
  maxRows,
  isFiltered = false,
  visibleCount,
}: {
  /** the number the rows add up to — highlighted only while `isFiltered` */
  totalCount: number;
  groups: ColoredStatsGroup[];
  isLoading: boolean;
  maxRows: number;
  /** narrowed to the highlighted features; changes heading and readout */
  isFiltered?: boolean;
  /** everything on screen, shown as the denominator while `isFiltered` */
  visibleCount?: number;
}) => {
  const shown = groups.slice(0, maxRows);
  const folded = groups.slice(maxRows);
  const foldedCount = folded.reduce((sum, group) => sum + group.count, 0);

  // the bar is drawn from the rows themselves rather than from `totalCount`, so
  // the segments always add up to exactly what the list below shows
  const segments = [
    ...shown,
    ...(folded.length > 0
      ? [
          {
            key: "__rest__",
            label: `${folded.length} weitere Quellen`,
            count: foldedCount,
            color: REST_COLOR,
          },
        ]
      : []),
  ].filter((segment) => segment.count > 0);
  const barTotal = segments.reduce((sum, segment) => sum + segment.count, 0);

  // a settled viewport stays on screen while the next one is queried — dimmed
  // rather than replaced by a skeleton, so nothing jumps on every pan
  const staleness = { opacity: isLoading ? 0.45 : 1 };

  return (
    <div
      className="pointer-events-auto w-[280px] rounded-lg bg-white/95 px-3.5 py-3 shadow-lg ring-1 ring-black/10"
      style={{ fontFamily: FONT_STACK }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* the filtered heading is the longer of the two and sits next to a
            two-part number, so it shrinks rather than wrapping the header */}
        <span
          className="min-w-0 truncate text-[11px] font-semibold uppercase leading-none tracking-[0.09em]"
          style={{ color: INK.title }}
        >
          {isFiltered ? "Hervorgehobene Objekte" : "Sichtbare Objekte"}
        </span>
        <span
          className="whitespace-nowrap text-[17px] font-semibold leading-none transition-opacity"
          style={{ color: INK.primary, ...staleness }}
        >
          {formatCount(totalCount)}
          {/* the denominator says what the panel is a share *of*, so a small
              highlight among thousands does not read as an empty map */}
          {isFiltered && visibleCount !== undefined && (
            <span
              className="text-[12px] font-normal"
              style={{ color: INK.secondary }}
            >
              {" / "}
              {formatCount(visibleCount)}
            </span>
          )}
        </span>
      </div>

      <div className="transition-opacity" style={staleness}>
        <div className="mt-2.5 flex h-[5px] gap-[2px]">
          {segments.length === 0 ? (
            <span
              className="flex-1 rounded-full"
              style={{ backgroundColor: INK.track }}
            />
          ) : (
            segments.map((segment) => (
              <span
                key={segment.key}
                className="rounded-full"
                title={`${segment.label}: ${formatCount(segment.count)} (${(
                  (segment.count / barTotal) *
                  100
                ).toFixed(1)} %)`}
                // grow by count, but never thinner than a visible sliver — a
                // handful of features among thousands still gets a mark
                style={{
                  flex: `${segment.count} 1 0`,
                  minWidth: 3,
                  backgroundColor: segment.color,
                }}
              />
            ))
          )}
        </div>

        {groups.length === 0 ? (
          <p className="mt-3 text-[12px]" style={{ color: INK.secondary }}>
            {isLoading
              ? "wird ermittelt …"
              : isFiltered
              ? // an empty *filter* is not an empty map — say which one it is
                "keine hervorgehobenen Objekte"
              : "keine Objekte im Ausschnitt"}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {shown.map((group) => (
              <li key={group.key}>
                <div className="flex items-center gap-2.5">
                  <Swatch shape={group.shape} color={group.color} />
                  <span
                    className="flex-1 truncate text-[13px] font-medium"
                    style={{ color: INK.primary }}
                    title={group.key}
                  >
                    {group.label}
                  </span>
                  <span
                    className="text-[13px] font-medium tabular-nums"
                    style={{ color: INK.primary }}
                  >
                    {formatCount(group.count)}
                  </span>
                </div>
                {group.children.length > 0 && (
                  <ul
                    className="mt-1 flex flex-col gap-1"
                    style={{ paddingLeft: CHILD_INDENT_PX }}
                  >
                    {group.children.slice(0, maxRows).map((child) => (
                      <li
                        key={child.key}
                        className="flex items-center gap-2.5 text-[12px]"
                        style={{ color: INK.secondary }}
                      >
                        <span className="flex-1 truncate" title={child.key}>
                          {child.label}
                        </span>
                        <span className="tabular-nums">
                          {formatCount(child.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {folded.length > 0 && (
              <li
                className="flex items-center gap-2.5 text-[12px]"
                style={{ color: INK.secondary }}
              >
                <Swatch shape="area" color={REST_COLOR} />
                <span className="flex-1 truncate">
                  {folded.length} weitere Quellen
                </span>
                <span className="tabular-nums">{formatCount(foldedCount)}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

/**
 * Group key -> palette slot, in the order the keys were first seen and kept for
 * the life of the addon. Rows are sorted by count and panning reorders them, so
 * indexing the palette by row position would repaint every group on every pan;
 * this way "Wohngebäude is blue" holds for the whole session. Slots run out
 * after eight — anything later shares the neutral, which is also what the
 * folded tail wears.
 */
const useStableSeriesColors = (
  groups: LayerStatsGroup[]
): ColoredStatsGroup[] => {
  const slots = useRef<Map<string, number>>(new Map());

  return useMemo(() => {
    const assigned = slots.current;
    return groups.map((group) => {
      let slot = assigned.get(group.key);
      if (slot === undefined) {
        slot = assigned.size;
        assigned.set(group.key, slot);
      }
      return { ...group, color: SERIES_COLORS[slot] ?? REST_COLOR };
    });
  }, [groups]);
};

/** nothing published yet — the source is there, its first query is not */
const PENDING: LayerStatsGroup[] = [];

export const VisibleFeatureStatsPanel = ({
  // `config` is optional on every addon, and this one is usable on defaults
  // alone — destructuring `undefined` would throw before the first render
  config = {},
}: AddonComponentProps<"visibleFeatureStatsPanel">) => {
  const {
    position = DEFAULT_POSITION,
    order = DEFAULT_ORDER,
    maxRows = DEFAULT_MAX_ROWS,
  } = config;

  const [stats] = useAddonState("visibleFeatureStats");
  const coloredGroups = useStableSeriesColors(stats?.groups ?? PENDING);

  // `Control` renders nothing here — it registers the panel into the surrounding
  // `ControlLayout` (AddonHost sits inside it) and the layout draws it in that
  // corner, sorted by `order`.
  return (
    <Control position={position} order={order}>
      <StatsReadout
        totalCount={stats?.totalCount ?? 0}
        groups={coloredGroups}
        // before the first publish the query is genuinely still running, so the
        // pending panel is the same dimmed "wird ermittelt …" as any other pan
        isLoading={stats?.isLoading ?? true}
        maxRows={maxRows}
        isFiltered={stats?.isFiltered ?? false}
        visibleCount={stats?.visibleCount}
      />
    </Control>
  );
};
