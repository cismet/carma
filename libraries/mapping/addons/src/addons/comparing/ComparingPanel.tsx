import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faLeftRight,
  faMagnifyingGlass,
  faMap,
  faTableCells,
  faUpDown,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import type { Layer } from "@carma-mapping/layers";

import { useComparingActions } from "./comparing-actions";
import {
  MAX_PANELS,
  useCompareLayerEntries,
  type CompareLayerEntry,
} from "./comparing-layers";
import "./stage/comparing.css";

/**
 * The modes, with the panel counts each one means anything at: stripes work
 * along one axis for two or three, four is the grid and has no orientation
 * left to choose, and a lens shows one map under it, so it is a two-panel mode.
 * `built` is what exists; the rest are listed so the pane shows where the
 * comparison is going.
 */
const MODES: {
  key: string;
  label: string;
  icon: IconDefinition;
  panelCounts: number[];
  built: boolean;
}[] = [
  {
    key: "swipe-h",
    label: "Nebeneinander",
    icon: faLeftRight,
    panelCounts: [2, 3],
    built: true,
  },
  {
    key: "swipe-v",
    label: "Übereinander",
    icon: faUpDown,
    panelCounts: [2, 3],
    built: true,
  },
  {
    key: "grid",
    label: "Raster",
    icon: faTableCells,
    panelCounts: [4],
    built: true,
  },
  {
    key: "spyglass",
    label: "Lupe",
    icon: faMagnifyingGlass,
    panelCounts: [2],
    built: false,
  },
];

export type ComparingPanelProps = {
  layer: Layer;
  /**
   * Switches a layer on or off in the host's layer bar.
   *
   * Ticking a layer that is switched off has to switch it on, or the tick does
   * nothing visible; unticking its last panel switches it off again. The pane
   * cannot dispatch that itself, so the host passes it in.
   */
  onLayerVisibilityChange?: (id: string, visible: boolean) => void;
};

/** the playground's compact pill group: one bar, the active choice raised */
const Segment = ({ children }: { children: ReactNode }) => (
  <div className="inline-flex items-center rounded-lg bg-gray-100 p-1 gap-1">
    {children}
  </div>
);

const SegmentButton = ({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    disabled={disabled}
    title={title}
    onClick={onClick}
    className={`text-base rounded-md px-3 py-1 border-0 whitespace-nowrap ${
      active
        ? "bg-white text-gray-900 shadow-sm"
        : disabled
        ? "bg-transparent text-gray-300 cursor-not-allowed"
        : "bg-transparent text-gray-500 cursor-pointer hover:text-gray-800"
    }`}
  >
    {children}
  </button>
);

const MatrixRow = ({
  entry,
  panelCount,
  panels,
  onToggle,
}: {
  entry: CompareLayerEntry;
  panelCount: number;
  panels: number[];
  onToggle: (panel: number, assigned: boolean) => void;
}) => (
  <div
    className="flex items-center gap-2 py-1 min-w-0"
    data-test-id="comparing-panel-layer-row"
  >
    <FontAwesomeIcon
      icon={entry.isBackground ? faLayerGroup : faMap}
      className={entry.visible ? "text-gray-700" : "text-gray-300"}
    />
    <span
      className={`text-base truncate grow ${
        entry.visible ? "text-gray-800" : "text-gray-400"
      }`}
      title={
        entry.visible
          ? entry.title
          : `${entry.title} (in der Kartenebenen-Leiste ausgeschaltet)`
      }
    >
      {entry.title}
      {entry.isBackground && (
        <span className="text-sm text-gray-400"> (Hintergrund)</span>
      )}
    </span>
    {Array.from({ length: panelCount }, (_, panel) => (
      <label
        key={panel}
        className="w-16 shrink-0 flex items-center justify-center cursor-pointer m-0 self-stretch rounded hover:bg-gray-100"
      >
        <input
          type="checkbox"
          className="cursor-pointer w-4 h-4"
          checked={panels.includes(panel)}
          onChange={(event) => onToggle(panel, event.target.checked)}
        />
      </label>
    ))}
  </div>
);

/**
 * The comparison's control pane, opened from the button on the `__comparing__`
 * layer row and rendered in the host's interaction slot.
 *
 * Upper half: one row per assignable block, one column per panel, a tick where
 * that panel shows that block. A block ticked in several panels is one row with
 * several ticks, which is the question the pane exists to answer; a panel with
 * nothing ticked renders blank, which is what the assignment says.
 *
 * Lower half: the modes.
 *
 * The pane is as tall as its content up to a cap, rather than the fixed height
 * of the layer-info panel it borrows its width from: it hangs over the very
 * comparison it describes, so every unused row is in the way.
 */
export const ComparingPanel = ({
  onLayerVisibilityChange,
}: ComparingPanelProps) => {
  const {
    panelCount,
    setPanelCount,
    panelLabels,
    mode,
    setMode,
    assignments,
    setAssigned,
  } = useComparingActions();
  const entries = useCompareLayerEntries();

  // comparing more panels than there are layers to put in them leaves panels
  // with nothing to show, so the choice stops at what is on the map
  const assignableCount = entries.filter((entry) => !entry.isBackground).length;
  const maxPanels = Math.min(MAX_PANELS, Math.max(assignableCount, 2));

  const toggle = (entry: CompareLayerEntry, panel: number, next: boolean) => {
    setAssigned(entry.key, panel, next);
    // Ticking a layer that is switched off has to switch it on, or the tick
    // does nothing visible. Unticking never switches anything off: a layer
    // shown in no panel keeps its row here, ready to be put back.
    if (next && !entry.visible) {
      onLayerVisibilityChange?.(entry.key, true);
    }
  };

  return (
    <div
      data-test-id="comparing-panel"
      className="carma-comparing-pane w-[100vw] sm:w-[75vw] sm:max-w-[560px] md:max-w-[720px] max-h-[60vh] sm:max-h-[45vh] shrink-0 bg-white rounded-[10px] flex flex-col relative gap-2 px-4 py-3"
    >
      <div className="flex items-center gap-2 shrink-0">
        <h5 className="m-0 text-lg font-semibold grow">Karteninhalte</h5>
        {Array.from({ length: panelCount }, (_, panel) => (
          <span
            key={panel}
            className="w-16 shrink-0 text-center text-sm text-gray-500 truncate"
            title={panelLabels[panel]}
          >
            {panelLabels[panel] ?? `Ansicht ${panel + 1}`}
          </span>
        ))}
      </div>

      <div className="grow overflow-auto min-h-0 divide-y divide-solid divide-gray-100 border-0">
        {entries.length === 0 ? (
          <div className="text-base text-gray-400 py-2">Keine Karteninhalte</div>
        ) : (
          entries.map((entry) => (
            <MatrixRow
              key={entry.key}
              entry={entry}
              panelCount={panelCount}
              panels={assignments?.[entry.key] ?? []}
              onToggle={(panel, next) => toggle(entry, panel, next)}
            />
          ))
        )}
      </div>

      <div className="shrink-0 border-0 border-t border-solid border-gray-200 pt-2 flex flex-wrap items-center gap-2">
        <Segment>
          {Array.from({ length: MAX_PANELS - 1 }, (_, i) => i + 2).map(
            (count) => (
              <SegmentButton
                key={count}
                active={count === panelCount}
                disabled={count > maxPanels}
                title={
                  count > maxPanels
                    ? "Dafür liegen zu wenige Karteninhalte auf der Karte"
                    : undefined
                }
                onClick={() => setPanelCount(count)}
              >
                {`${count} Karten`}
              </SegmentButton>
            )
          )}
        </Segment>

        <Segment>
          {MODES.map((entry) => {
            const fits = entry.panelCounts.includes(panelCount);
            return (
              <SegmentButton
                key={entry.key}
                active={entry.key === mode}
                disabled={!entry.built || !fits}
                title={
                  entry.built
                    ? fits
                      ? entry.label
                      : `${entry.label}: nicht bei ${panelCount} Karten`
                    : `${entry.label}: noch nicht gebaut`
                }
                onClick={() => setMode(entry.key)}
              >
                <FontAwesomeIcon icon={entry.icon} className="mr-2" />
                {entry.label}
              </SegmentButton>
            );
          })}
        </Segment>
      </div>
    </div>
  );
};
