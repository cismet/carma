import {
  useEffect,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripLinesVertical,
  faGripVertical,
  faLayerGroup,
  faLeftRight,
  faMagnifyingGlass,
  faMap,
  faRotateLeft,
  faTableCellsLarge,
  faUpDown,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import type { Layer } from "@carma-mapping/layers";

import { useComparingActions } from "./comparing-actions";
import {
  COMPARE_MODE,
  MODE_PANEL_COUNTS,
  orientationApplies,
  panelCountApplies,
  type CompareMode,
  type CompareOrientation,
} from "./compare-modes";
import {
  MAX_PANELS,
  useCompareLayerEntries,
  type CompareLayerEntry,
} from "./comparing-layers";
import "./stage/comparing.css";

/**
 * Who draws the panels.
 *
 * The counts each one can draw are in `MODE_PANEL_COUNTS`, where the state
 * enforces them; this list is only the picker's labels and icons. Picking a
 * mode that cannot draw the current count moves the count rather than being
 * refused, so none of these is ever unreachable.
 */
const MODES: {
  key: CompareMode;
  label: string;
  icon: IconDefinition;
}[] = [
  {
    key: COMPARE_MODE.swipe,
    label: "Schieber",
    icon: faGripLinesVertical,
  },
  {
    key: COMPARE_MODE.arena,
    label: "Arena",
    icon: faTableCellsLarge,
  },
  {
    key: COMPARE_MODE.spyglass,
    label: "Lupe",
    icon: faMagnifyingGlass,
  },
];

/** what a mode is called, for a sentence about what it can and cannot do */
const labelOfMode = (mode: CompareMode) =>
  MODES.find((entry) => entry.key === mode)?.label ?? mode;

/**
 * Which way the panels are laid out, whichever mode is drawing them.
 *
 * Four panels are the 2x2 in both modes, so at that count there is no axis left
 * to choose and the pair is offered but inert.
 */
const ORIENTATIONS: {
  key: CompareOrientation;
  label: string;
  icon: IconDefinition;
}[] = [
  { key: "horizontal", label: "Nebeneinander", icon: faLeftRight },
  { key: "vertical", label: "\u00dcbereinander", icon: faUpDown },
];

/** what a drag carries: the block, and the panel it came from if it was in one */
const DRAG_KEY = "application/x-carma-compare-layer";
const DRAG_FROM = "application/x-carma-compare-panel";

/**
 * How wide one panel box is.
 *
 * The floor carries the caption ("Unten rechts" is the longest); above that a
 * box takes an even share of whatever the list has not claimed, so the boxes
 * fill their side instead of huddling against the edge of it.
 */
const PANEL_TRACK = "minmax(8rem, 1fr)";

/** the number a block is known by, since layers of one kind share an icon */
const numberOf = (entry: CompareLayerEntry, indexFromTop: number) =>
  entry.isBackground ? "H" : `${indexFromTop + 1}`;

const LayerGlyph = ({
  entry,
  size,
}: {
  entry: CompareLayerEntry;
  size: number;
}) =>
  entry.iconUrl ? (
    <img
      src={entry.iconUrl}
      alt=""
      // the layer bar's own icon treatment: contained, multiplied onto the row
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        mixBlendMode: "multiply",
      }}
    />
  ) : (
    <FontAwesomeIcon
      icon={entry.isBackground ? faLayerGroup : faMap}
      style={{ fontSize: size, color: entry.visible ? "#374151" : "#9ca3af" }}
    />
  );

const Badge = ({ children }: { children: string }) => (
  <span className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-gray-900 text-white text-[10px] leading-none flex items-center justify-center border-2 border-solid border-white">
    {children}
  </span>
);

/**
 * One block inside a panel. Tiles stack upwards without covering each other, so
 * every number stays readable; the topmost tile is the layer drawn last.
 */
const PanelTile = ({
  entry,
  number,
  panel,
  onRemove,
  onDragStart,
}: {
  entry: CompareLayerEntry;
  number: string;
  panel: number;
  onRemove: () => void;
  onDragStart: (event: DragEvent) => void;
}) => (
  <div
    draggable
    onDragStart={onDragStart}
    title={`${entry.title} – ziehen, um sie in eine andere Karte zu legen`}
    className="group relative w-11 h-11 rounded-md border border-solid border-gray-300 bg-white shadow-sm flex items-center justify-center cursor-grab"
    data-test-id={`comparing-tile-${panel}-${entry.key}`}
  >
    {/* the icons are 32px images, so the preview shows them at their own size
        rather than shrinking them the way a layer row does */}
    <LayerGlyph entry={entry} size={32} />
    <Badge>{number}</Badge>
    <button
      type="button"
      onClick={onRemove}
      title="Aus dieser Karte entfernen"
      className="hidden group-hover:flex absolute -left-1.5 -top-1.5 w-4 h-4 rounded-full bg-white text-gray-500 hover:text-gray-800 border border-solid border-gray-300 p-0 items-center justify-center cursor-pointer"
    >
      <FontAwesomeIcon icon={faXmark} className="text-[9px]" />
    </button>
  </div>
);

export type ComparingPanelProps = {
  layer: Layer;
  /**
   * Switches a layer on or off in the host's layer bar.
   *
   * Dragging a layer that is switched off into a panel has to switch it on, or
   * the panel stays empty. The pane cannot dispatch that, so the host passes it
   * in.
   */
  onLayerVisibilityChange?: (id: string, visible: boolean) => void;
  /**
   * Closes the pane, which the pane cannot do itself: it is shown by the host
   * for whichever layer row's button is active, and only the host can make that
   * button inactive again. Bound to Escape here.
   */
  onClose?: () => void;
};

/**
 * The comparison's control pane, opened from the button on the `__comparing__`
 * layer row and rendered in the host's interaction slot.
 *
 * Left: the layers, each with the icon the layer bar shows and a number, since
 * layers of one kind share an icon and only the number tells them apart. Right:
 * the map's own division, one box per panel, holding the blocks that panel
 * shows as a stack that covers nothing.
 *
 * Dragging out of the list copies, dragging a tile from one box to another
 * moves, and the same block cannot land twice in one box.
 */
export const ComparingPanel = ({
  onLayerVisibilityChange,
  onClose,
}: ComparingPanelProps) => {
  const {
    panelCount,
    setPanelCount,
    panelLabels,
    mode,
    setMode,
    orientation,
    setOrientation,
    assignments,
    setAssigned,
    setAssignedEverywhere,
    resetLayout,
  } = useComparingActions();
  const entries = useCompareLayerEntries();
  const [dragOver, setDragOver] = useState<number | null>(null);

  // on the window rather than on the pane: the pane holds no focus of its own,
  // so a keystroke never reaches it, and Escape is expected to work wherever
  // the pointer happens to be
  useEffect(() => {
    if (!onClose) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // the boxes are the panels, so they have to sit the way the mode draws them:
  // stacked bands for "Übereinander", columns for "Nebeneinander", 2x2 for the
  // grid. A band is wide and low, so its stack is turned a quarter turn to the
  // right, which puts the topmost layer at the right end instead of the top.
  const isGrid = panelCount === 4;
  const isLens = mode === COMPARE_MODE.spyglass;
  const isBanded = !isLens && orientation === "vertical" && !isGrid;

  // comparing more panels than there are layers to put in them leaves panels
  // with nothing to show, so the choice stops at what is on the map
  const assignableCount = entries.filter(
    (entry) => !entry.isBackground && entry.visible
  ).length;
  const maxPanels = Math.min(MAX_PANELS, Math.max(assignableCount, 2));

  const inEveryPanel = (key: string) => {
    const panels = assignments?.[key] ?? [];
    return (
      panelCount > 0 &&
      Array.from({ length: panelCount }, (_, panel) => panel).every((panel) =>
        panels.includes(panel)
      )
    );
  };

  const numbered = entries.map((entry, index) => ({
    entry,
    number: numberOf(entry, index),
  }));

  const startDrag = (key: string, from?: number) => (event: DragEvent) => {
    event.dataTransfer.setData(DRAG_KEY, key);
    event.dataTransfer.setData(DRAG_FROM, from === undefined ? "" : `${from}`);
    event.dataTransfer.effectAllowed = from === undefined ? "copy" : "move";
  };

  const drop = (panel: number) => (event: DragEvent) => {
    event.preventDefault();
    setDragOver(null);
    const key = event.dataTransfer.getData(DRAG_KEY);
    if (!key) {
      return;
    }
    const raw = event.dataTransfer.getData(DRAG_FROM);
    const from = raw === "" ? undefined : Number(raw);
    if (from === panel) {
      return;
    }
    if (from !== undefined) {
      // inside the preview a tile changes places rather than multiplying
      setAssigned(key, from, false);
    }
    setAssigned(key, panel, true);
    const entry = entries.find((candidate) => candidate.key === key);
    if (entry && !entry.visible) {
      onLayerVisibilityChange?.(key, true);
    }
  };

  return (
    <div
      data-test-id="comparing-panel"
      className="carma-comparing-pane w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[860px] max-h-[70vh] sm:max-h-[60vh] shrink-0 bg-white rounded-[10px] flex flex-col relative gap-2 px-4 py-3"
    >
      <div className="flex items-baseline gap-3 shrink-0">
        <h5 className="m-0 text-lg font-semibold grow">Karteninhalte</h5>
        <span className="text-sm text-gray-400">
          Aus der Liste in eine Karte ziehen
        </span>
        <button
          type="button"
          onClick={resetLayout}
          title="Aufteilung zurücksetzen: so viele Karten wie Inhalte, jeder Inhalt in einer davon"
          data-test-id="comparing-reset"
          className="shrink-0 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-transparent border-0 p-0 cursor-pointer"
        >
          <FontAwesomeIcon icon={faRotateLeft} />
          Zurücksetzen
        </button>
      </div>

      {/* The list is capped at what a full layer title comes to, which is all
          the width it can use; the boxes take the rest. Sized the other way
          round the titles were cut off, and left uncapped the list stretched
          into a field of nothing with its checkbox out at the far edge. */}
      <div className="grow min-h-0 overflow-auto grid grid-cols-1 sm:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-4">
        <div className="flex flex-col min-w-0">
          {numbered.length === 0 ? (
            <div className="text-base text-gray-400 py-2">
              Keine Karteninhalte
            </div>
          ) : (
            numbered.map(({ entry, number }) => (
              <div
                key={entry.key}
                draggable
                onDragStart={startDrag(entry.key)}
                title={entry.title}
                data-test-id="comparing-panel-layer-row"
                className="flex items-center gap-2 py-1 px-1 min-w-0 rounded hover:bg-gray-50 cursor-grab"
              >
                <FontAwesomeIcon
                  icon={faGripVertical}
                  className="text-gray-300 text-xs"
                />
                <span className="w-5 h-5 shrink-0 rounded-full bg-gray-900 text-white text-[11px] leading-none flex items-center justify-center">
                  {number}
                </span>
                <LayerGlyph entry={entry} size={16} />
                <span
                  className={`text-base truncate grow ${
                    entry.visible ? "text-gray-800" : "text-gray-400"
                  }`}
                >
                  {entry.title}
                </span>
                {/* the background belongs under every panel or under none, and
                    dragging it into each one in turn is busywork */}
                {entry.isBackground && (
                  <label
                    className="shrink-0 flex items-center justify-center w-6 h-6 m-0 cursor-pointer"
                    title="In allen Karten"
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      className="cursor-pointer w-4 h-4"
                      checked={inEveryPanel(entry.key)}
                      onChange={(event) =>
                        setAssignedEverywhere(entry.key, event.target.checked)
                      }
                    />
                  </label>
                )}
              </div>
            ))
          )}
        </div>

        <div
          className="grid gap-2 min-w-0"
          style={{
            // wide enough for the caption, then as wide as the pile of tiles
            // happens to be. A band lays its tiles out in a row, so it asks for
            // more than an upright box and gets it from the same rule.
            gridTemplateColumns: isBanded
              ? PANEL_TRACK
              : `repeat(${isGrid ? 2 : panelCount}, ${PANEL_TRACK})`,
          }}
        >
          {Array.from({ length: panelCount }, (_, panel) => {
            const inPanel = numbered.filter(({ entry }) =>
              (assignments?.[entry.key] ?? []).includes(panel)
            );
            return (
              <div
                key={panel}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(panel);
                }}
                onDragLeave={() => setDragOver((it) => (it === panel ? null : it))}
                onDrop={drop(panel)}
                data-test-id={`comparing-view-${panel}`}
                className={`relative rounded-lg border border-solid p-2 flex flex-col gap-1 ${
                  isBanded ? "min-h-[4.75rem]" : "min-h-[7rem]"
                } ${
                  dragOver === panel
                    ? "border-[#1677ff] bg-[#1677ff]/5"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                {/* on its own line: a box is only as wide as its tiles, so a
                    caption floating over them would land on top of them */}
                <span className="block text-sm text-gray-500 truncate pointer-events-none">
                  {panelLabels[panel] ?? `Ansicht ${panel + 1}`}
                </span>
                {/* the entries are already topmost-first, so plain column order
                    puts the layer drawn last at the top of the pile and the
                    background at the bottom, as the map has it. Turned on its
                    side in a band, the same order runs to the right. */}
                <div
                  className={`grow flex items-center justify-center gap-1.5 ${
                    isBanded ? "flex-row-reverse" : "flex-col"
                  }`}
                >
                  {inPanel.length === 0 ? (
                    <span className="text-sm text-gray-300">leer</span>
                  ) : (
                    inPanel.map(({ entry, number }) => (
                      <PanelTile
                        key={entry.key}
                        entry={entry}
                        number={number}
                        panel={panel}
                        onRemove={() => setAssigned(entry.key, panel, false)}
                        onDragStart={startDrag(entry.key, panel)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-0 border-t border-solid border-gray-200 pt-2 flex flex-wrap items-center gap-2">
        <Segment>
          {Array.from({ length: MAX_PANELS - 1 }, (_, i) => i + 2).map(
            (count) => {
              // two reasons a count can be out: the map does not carry enough
              // to fill that many panels, or the running mode cannot draw them
              const tooFewLayers = count > maxPanels;
              const modeRulesOut = !panelCountApplies(mode, count);
              return (
                <SegmentButton
                  key={count}
                  active={count === panelCount}
                  disabled={tooFewLayers || modeRulesOut}
                  title={
                    modeRulesOut
                      ? `${labelOfMode(mode)}: nur ${MODE_PANEL_COUNTS[
                          mode
                        ].join(" oder ")} Karten`
                      : tooFewLayers
                      ? "Dafür liegen zu wenige Karteninhalte auf der Karte"
                      : undefined
                  }
                  onClick={() => setPanelCount(count)}
                >
                  {`${count} Karten`}
                </SegmentButton>
              );
            }
          )}
        </Segment>

        <Segment>
          {MODES.map((entry) => {
            const fits = panelCountApplies(entry.key, panelCount);
            return (
              <SegmentButton
                key={entry.key}
                active={entry.key === mode}
                title={
                  fits
                    ? entry.label
                    : `${entry.label}: zeigt ${MODE_PANEL_COUNTS[entry.key].join(
                        " oder "
                      )} Karten`
                }
                onClick={() => setMode(entry.key)}
              >
                <FontAwesomeIcon icon={entry.icon} className="mr-2" />
                {entry.label}
              </SegmentButton>
            );
          })}
        </Segment>

        <Segment>
          {ORIENTATIONS.map((entry) => (
            <SegmentButton
              key={entry.key}
              active={entry.key === orientation}
              disabled={!orientationApplies(panelCount, mode)}
              title={
                orientationApplies(panelCount, mode)
                  ? entry.label
                  : mode === COMPARE_MODE.spyglass
                  ? `${entry.label}: die Lupe wird gezogen, nicht ausgerichtet`
                  : `${entry.label}: bei ${panelCount} Karten ist es das Raster`
              }
              onClick={() => setOrientation(entry.key)}
            >
              <FontAwesomeIcon icon={entry.icon} className="mr-2" />
              {entry.label}
            </SegmentButton>
          ))}
        </Segment>
      </div>
    </div>
  );
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
