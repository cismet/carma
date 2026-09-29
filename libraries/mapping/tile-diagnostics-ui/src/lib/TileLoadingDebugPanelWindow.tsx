import type {
  Dispatch,
  ReactNode,
  MutableRefObject,
  SetStateAction,
} from "react";
import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faCrosshairs,
  faHand,
  faCircleInfo,
  faGripVertical,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import * as THREE from "three";
import {
  TILE_DIAGNOSTIC_LABEL_MODE,
  TILE_DIAGNOSTIC_OVERVIEW_VIEW,
  type TileDiagnosticSummary,
} from "@carma-mapping/engines/maplibre";
import { DiagnosticWindowActions } from "./DiagnosticControls";
import { DiagnosticWindow as Popout } from "./DiagnosticWindow";
import type { ResolvedDebugOptions } from "./tile-loading-debug-options";
import type { createTileLoadingDebugPanels } from "./tile-loading-debug-panels";
import {
  TILE_LOADING_DEBUG_OVERVIEW_MODE,
  TILE_LOADING_DEBUG_PANEL_ID,
  type TileLoadingDebugOverviewMode,
  type TileLoadingDebugPanelId,
} from "./tile-loading-debug-tokens";

type Panel = ReturnType<typeof createTileLoadingDebugPanels>[number];
type PanelPosition = { left: number; top: number };
type PanelDrag = {
  id: string;
  x: number;
  y: number;
  left: number;
  top: number;
  maxLeft: number;
  maxTop: number;
  dx: number;
  dy: number;
  element: HTMLElement;
};

export const TileLoadingDebugPanelWindow = ({
  panel,
  externalPanels,
  externalSizes,
  panelPositions,
  frontPanel,
  legendExpanded,
  panelDrag,
  setExternalPanels,
  setPanelPositions,
  setFrontPanel,
  setLegendExpanded,
  toolsVisible,
  overviewMode,
  overviewIsExternal,
  options,
  onOptionsChange,
  setOverviewMode,
  summary,
  renderOverview,
}: {
  panel: Panel;
  externalPanels: Record<string, boolean>;
  externalSizes: MutableRefObject<
    Record<string, { width: number; height: number }>
  >;
  panelPositions: Record<string, PanelPosition>;
  frontPanel: TileLoadingDebugPanelId;
  legendExpanded: boolean;
  panelDrag: MutableRefObject<PanelDrag | null>;
  setExternalPanels: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPanelPositions: Dispatch<SetStateAction<Record<string, PanelPosition>>>;
  setFrontPanel: (id: TileLoadingDebugPanelId) => void;
  setLegendExpanded: Dispatch<SetStateAction<boolean>>;
  toolsVisible: boolean;
  overviewMode: TileLoadingDebugOverviewMode;
  overviewIsExternal: boolean;
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
  setOverviewMode: (mode: TileLoadingDebugOverviewMode) => void;
  summary: TileDiagnosticSummary | null;
  renderOverview: (windowed: boolean) => ReactNode;
}) => {
  const external = externalPanels[panel.id] === true;
  const isLegend = panel.id === TILE_LOADING_DEBUG_PANEL_ID.LEGEND;
  const canvasPanel =
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW ||
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.CHARTS ||
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.LOG;
  const formPanel =
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.MESH_STYLE ||
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS ||
    panel.id === TILE_LOADING_DEBUG_PANEL_ID.DIAGNOSTIC_TOOLS;
  const panelTop = Math.min(
    panelPositions[panel.id]?.top ??
      (isLegend ? window.innerHeight - 44 : panel.top),
    Math.max(48, window.innerHeight - (isLegend ? 44 : 130))
  );
  const visible =
    toolsVisible &&
    (panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW
      ? overviewMode !== TILE_LOADING_DEBUG_OVERVIEW_MODE.OFF &&
        (overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW || external)
      : options[panel.flag]);
  const dock = () =>
    setExternalPanels((current) => ({ ...current, [panel.id]: false }));
  const close = () => {
    dock();
    if (panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW)
      setOverviewMode(TILE_LOADING_DEBUG_OVERVIEW_MODE.OFF);
    else onOptionsChange({ [panel.flag]: false });
  };
  const windowControls = (
    <DiagnosticWindowActions
      label={panel.label}
      external={external}
      onClose={close}
      onToggleExternal={(event) => {
        // Measure once on undock, never from the map/render loop.
        const body = event.currentTarget
          .closest("section")
          ?.querySelector<HTMLElement>(
            "[data-test-id^='mesh-coverage-panel-body-']"
          );
        if (body)
          externalSizes.current[panel.id] = {
            width: body.clientWidth,
            height: body.clientHeight,
          };
        setExternalPanels((current) => ({
          ...current,
          [panel.id]: !external,
        }));
      }}
    >
      {isLegend && !external && (
        <Button
          type="text"
          icon={
            <FontAwesomeIcon
              icon={legendExpanded ? faChevronDown : faChevronUp}
            />
          }
          aria-label={legendExpanded ? "Collapse legend" : "Expand legend"}
          aria-expanded={legendExpanded}
          onClick={() => setLegendExpanded((expanded) => !expanded)}
        />
      )}
      {(panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS ||
        panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW) && (
        <>
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faCrosshairs} />}
            aria-label="Follow viewport"
            aria-pressed={
              options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
            }
            title={
              options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
                ? "Following viewport · drag to pan, Ctrl/right-drag to orbit, wheel to zoom"
                : "Follow viewport"
            }
            onClick={() =>
              onOptionsChange({
                overviewView:
                  options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
                    ? TILE_DIAGNOSTIC_OVERVIEW_VIEW.EXTENT
                    : TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM,
              })
            }
          />
          {(overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW ||
            overviewIsExternal) && (
            <Button
              type="text"
              icon={<FontAwesomeIcon icon={faHand} />}
              aria-label="Free pan/zoom"
              aria-pressed={
                options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE
              }
              title="Free pan/zoom · window only"
              onClick={() =>
                onOptionsChange({
                  overviewView:
                    options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE
                      ? TILE_DIAGNOSTIC_OVERVIEW_VIEW.EXTENT
                      : TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE,
                })
              }
            />
          )}
        </>
      )}
      {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW && (
        <Button
          className="tile-debug-header-toggle"
          type="text"
          aria-label="Resident tile size grid"
          aria-pressed={options.overviewSize !== false}
          title="Square resident cache-size grid and labels"
          onClick={() =>
            onOptionsChange({
              overviewSize: options.overviewSize === false,
              overlayLabels:
                options.overviewSize === false
                  ? TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_STATS
                  : TILE_DIAGNOSTIC_LABEL_MODE.ID,
            })
          }
        >
          B
        </Button>
      )}
      {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW && (
        <Button
          className="tile-debug-header-toggle"
          type="text"
          aria-label="Tile processing steps"
          aria-pressed={options.overviewSteps !== false}
          title="Processing time pies"
          onClick={() =>
            onOptionsChange({
              overviewSteps: options.overviewSteps === false,
            })
          }
        >
          ms
        </Button>
      )}
      {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW && (
        <Button
          type="text"
          icon={<FontAwesomeIcon icon={faSliders} />}
          aria-label="Overview options"
          aria-pressed={options.showOverviewOptions}
          title="Overview options"
          onClick={() => {
            setFrontPanel(TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS);
            onOptionsChange({
              showOverviewOptions: !options.showOverviewOptions,
            });
          }}
        />
      )}
      {(panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS ||
        panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW) && (
        <Button
          className="tile-debug-header-toggle"
          type="text"
          icon={<FontAwesomeIcon icon={faCircleInfo} />}
          aria-label="Show / hide overview legend"
          aria-pressed={options.showLegend}
          title={options.showLegend ? "Hide legend" : "Show legend"}
          onClick={() => onOptionsChange({ showLegend: !options.showLegend })}
        >
          Legend
        </Button>
      )}
    </DiagnosticWindowActions>
  );
  return (
    <div key={panel.id}>
      <section
        className="tile-debug-panel"
        data-test-id={`mesh-coverage-panel-${panel.id}`}
        role="dialog"
        aria-label={panel.label}
        style={{
          position: "fixed",
          left: Math.min(
            panelPositions[panel.id]?.left ?? panel.left,
            Math.max(8, window.innerWidth - 240)
          ),
          top: isLegend && !panelPositions[panel.id] ? undefined : panelTop,
          bottom: isLegend && !panelPositions[panel.id] ? 12 : undefined,
          width: isLegend ? panel.width : "max-content",
          maxWidth: "calc(100vw - 24px)",
          zIndex: frontPanel === panel.id ? 12 : 10,
          display: visible && !external ? "block" : "none",
        }}
        onPointerDown={() => setFrontPanel(panel.id)}
      >
        <header
          aria-label={`Drag ${panel.label}`}
          tabIndex={0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 4px 2px 8px",
            height: 32,
            boxSizing: "border-box",
            background:
              panel.id === TILE_LOADING_DEBUG_PANEL_ID.CHARTS
                ? "transparent"
                : "rgb(241 245 249 / 80%)",
            borderBottom: "1px solid rgb(100 116 139 / 16%)",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            font: "600 12px system-ui",
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target as HTMLElement).closest("button")
            )
              return;
            const element = event.currentTarget.parentElement!;
            const rect = element.getBoundingClientRect();
            if (isLegend) {
              element.style.bottom = "auto";
              element.style.top = `${rect.top}px`;
            }
            panelDrag.current = {
              id: panel.id,
              x: event.clientX,
              y: event.clientY,
              left: rect.left,
              top: rect.top,
              maxLeft: Math.max(0, window.innerWidth - rect.width),
              maxTop: Math.max(44, window.innerHeight - 36),
              dx: 0,
              dy: 0,
              element,
            };
            element.style.willChange = "transform";
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const drag = panelDrag.current;
            if (!drag || drag.id !== panel.id) return;
            // Compositor-only movement, with bounds measured once at
            // pointerdown. No layout read or React render per move.
            drag.dx =
              THREE.MathUtils.clamp(
                drag.left + event.clientX - drag.x,
                0,
                drag.maxLeft
              ) - drag.left;
            drag.dy =
              THREE.MathUtils.clamp(
                drag.top + event.clientY - drag.y,
                44,
                drag.maxTop
              ) - drag.top;
            drag.element.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0)`;
          }}
          onLostPointerCapture={() => {
            const drag = panelDrag.current;
            if (!drag) return;
            const left = drag.left + drag.dx;
            const top = drag.top + drag.dy;
            drag.element.style.transform = "";
            drag.element.style.willChange = "";
            drag.element.style.left = `${left}px`;
            drag.element.style.top = `${top}px`;
            setPanelPositions((current) => ({
              ...current,
              [drag.id]: {
                left,
                top,
              },
            }));
            panelDrag.current = null;
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key
              )
            )
              return;
            event.preventDefault();
            const rect =
              event.currentTarget.parentElement!.getBoundingClientRect();
            setPanelPositions((current) => ({
              ...current,
              [panel.id]: {
                left: Math.max(
                  0,
                  rect.left +
                    (event.key === "ArrowLeft"
                      ? -10
                      : event.key === "ArrowRight"
                      ? 10
                      : 0)
                ),
                top: Math.max(
                  44,
                  rect.top +
                    (event.key === "ArrowUp"
                      ? -10
                      : event.key === "ArrowDown"
                      ? 10
                      : 0)
                ),
              },
            }));
          }}
        >
          <FontAwesomeIcon icon={faGripVertical} style={{ color: "#82909e" }} />
          <FontAwesomeIcon icon={panel.icon} />
          <span style={{ flex: 1 }}>
            {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS
              ? "Overview"
              : panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW
              ? "Kacheln"
              : panel.label}
            {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW && summary && (
              <span
                style={{
                  fontWeight: 400,
                  color: "#64748b",
                  marginLeft: 6,
                }}
              >
                Aktiv {summary.displayed} · Laden {summary.pending} · Cache{" "}
                {summary.resident}
              </span>
            )}
          </span>
          {windowControls}
        </header>
        <div
          data-test-id={`mesh-coverage-panel-body-${panel.id}`}
          style={{
            position: isLegend ? "absolute" : "relative",
            bottom: isLegend ? "100%" : undefined,
            display: isLegend && !legendExpanded ? "none" : undefined,
            width: formPanel ? 304 : panel.width,
            height: canvasPanel ? panel.height : "auto",
            minWidth: 220,
            minHeight: canvasPanel ? 100 : undefined,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: isLegend
              ? `min(calc(100vh - 88px), ${Math.max(0, panelTop - 12)}px)`
              : panel.id === TILE_LOADING_DEBUG_PANEL_ID.QUEUE
              ? Math.min(panel.height, window.innerHeight - panelTop - 44)
              : `calc(100vh - ${panelTop + 44}px)`,
            overflow: "auto",
            resize: panel.resize,
            padding:
              panel.id === TILE_LOADING_DEBUG_PANEL_ID.STATS ||
              panel.id === TILE_LOADING_DEBUG_PANEL_ID.QUEUE
                ? 12
                : 0,
            boxSizing: "border-box",
            background:
              panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW &&
              overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW
                ? "rgb(38 46 56 / 94%)"
                : undefined,
          }}
        >
          {visible &&
            !external &&
            (!isLegend || legendExpanded) &&
            panel.content()}
        </div>
      </section>
      <Popout
        open={visible === true && external === true}
        title={`Tile coverage ${panel.label}`}
        width={externalSizes.current[panel.id]?.width ?? panel.width}
        height={externalSizes.current[panel.id]?.height ?? panel.height}
        onClose={dock}
      >
        <div
          className="tile-debug-panel"
          style={{
            position: "relative",
            height: "100%",
          }}
        >
          <div
            role="group"
            aria-label={`${panel.label} window controls`}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              zIndex: 2,
              background:
                panel.id === TILE_LOADING_DEBUG_PANEL_ID.CHARTS
                  ? "transparent"
                  : "rgb(248 250 252 / 94%)",
            }}
          >
            {windowControls}
          </div>
          <div
            style={{
              position: "relative",
              height: "100%",
              overflow: "auto",
              padding:
                panel.id === TILE_LOADING_DEBUG_PANEL_ID.STATS ||
                panel.id === TILE_LOADING_DEBUG_PANEL_ID.QUEUE
                  ? 12
                  : 0,
              paddingTop:
                panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS ||
                panel.id === TILE_LOADING_DEBUG_PANEL_ID.DIAGNOSTIC_TOOLS
                  ? 28
                  : undefined,
              boxSizing: "border-box",
            }}
          >
            {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW
              ? renderOverview(true)
              : panel.content()}
          </div>
        </div>
      </Popout>
    </div>
  );
};
