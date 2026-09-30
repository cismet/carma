import {
  type Dispatch,
  type ReactNode,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import * as THREE from "three";
import {
  type ThreeTilesRuntime,
  type TileDiagnosticSummary,
} from "@carma-mapping/engines/maplibre";
import { DiagnosticWindowActions } from "./DiagnosticControls";
import {
  TileLoadingDebugOverviewControls,
  TileLoadingDebugOverviewLegend,
  TileLoadingDebugOverviewStats,
} from "./TileLoadingDebugOverviewOptions";
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
  runtimeHandle,
  legend,
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
  runtimeHandle: ThreeTilesRuntime;
  legend: ReactNode;
}) => {
  const external = externalPanels[panel.id] === true;
  const isOverview = panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW;
  const isLegend = panel.id === TILE_LOADING_DEBUG_PANEL_ID.LEGEND;
  const canvasPanel =
    isOverview ||
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
    (isOverview
      ? overviewMode !== TILE_LOADING_DEBUG_OVERVIEW_MODE.OFF &&
        (overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW || external)
      : options[panel.flag] &&
        !(
          isLegend &&
          (overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW ||
            overviewIsExternal)
        ));
  const dock = () =>
    setExternalPanels((current) => ({ ...current, [panel.id]: false }));
  const close = () => {
    dock();
    if (isOverview) setOverviewMode(TILE_LOADING_DEBUG_OVERVIEW_MODE.OFF);
    else onOptionsChange({ [panel.flag]: false });
  };
  const toggleOverviewOptions = () => {
    setFrontPanel(TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS);
    onOptionsChange({ showOverviewOptions: !options.showOverviewOptions });
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
      {panel.id === TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS && (
        <TileLoadingDebugOverviewControls
          options={options}
          onOptionsChange={onOptionsChange}
          windowed={
            overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW ||
            overviewIsExternal
          }
          fullControls={false}
          onToggleOptions={toggleOverviewOptions}
        />
      )}
    </DiagnosticWindowActions>
  );
  const overviewControlOverlay = panel.id ===
    TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW && (
    <>
      <div
        className="tile-debug-overview-controls tile-debug-overview-camera-controls tile-debug-window-controls"
        data-test-id="mesh-coverage-overview-controls"
        role="group"
        aria-label="Overview camera controls"
      >
        <TileLoadingDebugOverviewControls
          options={options}
          onOptionsChange={onOptionsChange}
          windowed={
            overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW ||
            overviewIsExternal
          }
          fullControls
          cameraControls
          displayControls={false}
          onToggleOptions={toggleOverviewOptions}
        />
      </div>
      <div
        className="tile-debug-overview-controls tile-debug-overview-display-controls tile-debug-window-controls"
        role="group"
        aria-label="Overview display controls"
        style={{ right: external ? 64 : 4 }}
      >
        <TileLoadingDebugOverviewControls
          options={options}
          onOptionsChange={onOptionsChange}
          windowed={
            overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW ||
            overviewIsExternal
          }
          fullControls
          cameraControls={false}
          displayControls
          onToggleOptions={toggleOverviewOptions}
        />
      </div>
      <TileLoadingDebugOverviewLegend
        open={options.showLegend && legendExpanded}
        onToggle={() => {
          setLegendExpanded(!legendExpanded || !options.showLegend);
          onOptionsChange({ showLegend: true });
        }}
      >
        {legend}
      </TileLoadingDebugOverviewLegend>
      <TileLoadingDebugOverviewStats
        runtimeHandle={runtimeHandle}
        summary={summary}
      />
    </>
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
            height: isOverview ? 28 : 32,
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
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {panel.label}
          </span>
          {windowControls}
        </header>
        <div
          data-test-id={`mesh-coverage-panel-body-${panel.id}`}
          style={{
            position: isLegend ? "absolute" : "relative",
            containerType: isOverview ? "inline-size" : undefined,
            bottom: isLegend ? "100%" : undefined,
            display: isLegend && !legendExpanded ? "none" : undefined,
            width: formPanel ? 304 : panel.width,
            height: canvasPanel ? panel.height : "auto",
            minWidth: isOverview ? 160 : 220,
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
              isOverview &&
              overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW
                ? "rgb(38 46 56 / 94%)"
                : undefined,
          }}
        >
          {overviewControlOverlay}
          {visible &&
            !external &&
            (!isLegend || legendExpanded) &&
            panel.content()}
        </div>
      </section>
      <Popout
        open={visible === true && external === true}
        title={isOverview ? "Overview" : `Tile coverage ${panel.label}`}
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
              containerType: isOverview ? "inline-size" : undefined,
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
            {overviewControlOverlay}
            {isOverview ? renderOverview(true) : panel.content()}
          </div>
        </div>
      </Popout>
    </div>
  );
};
