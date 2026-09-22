import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBug, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { loadTileDiagnostics } from "@carma-mapping/engines/maplibre";
import styles from "./TileLoadingDebug.module.css";
import {
  DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
  type ResolvedDebugOptions,
  type TileLoadingDebugProps,
} from "./tile-loading-debug-options";

export {
  DEBUG_COLOR_MODES,
  DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
  type DebugColorModeName,
  type TileLoadingDebugOptions,
  type TileLoadingDebugLoadingOptions,
  type TileLoadingDebugProps,
} from "./tile-loading-debug-options";

// No Three debug plugin, panels, charts, TypeGPU or worker is loaded while closed.
const Content = lazy(() =>
  Promise.all([
    import("./TileLoadingDebugContent"),
    loadTileDiagnostics(),
  ]).then(([{ createTileLoadingDebugContent }, diagnostics]) => ({
    default: createTileLoadingDebugContent(diagnostics),
  }))
);

export const TileLoadingDebug = (props: TileLoadingDebugProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(
    props.initialToolbarPosition ?? { left: 8, top: 8 }
  );
  const [localOpen, setLocalOpen] = useState(props.defaultOpen ?? false);
  const [localOptions, setLocalOptions] = useState<
    Partial<ResolvedDebugOptions>
  >({});
  const open = props.open ?? localOpen;
  const options = {
    ...DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
    ...props.options,
    ...localOptions,
  };
  const enabled = open && options.telemetryEnabled && !!props.runtimeHandle;
  const changeOptions = (patch: Partial<ResolvedDebugOptions>) => {
    if (props.onOptionsChange) props.onOptionsChange(patch);
    else setLocalOptions((current) => ({ ...current, ...patch }));
  };
  const changeOpen = (value: boolean) => {
    setLocalOpen(value);
    props.onOpenChange?.(value);
  };
  useEffect(() => {
    if (!enabled) props.runtimeHandle?.debug.setDiagnosticsEnabled(false);
  }, [enabled, props.runtimeHandle]);

  // Loader controls are application behavior, not diagnostic work. Keep them
  // usable without importing the diagnostic implementation.
  const { foveation, tilesetMinResolutionPx, parseJobs, cacheBudgetMB } =
    options;
  useEffect(() => {
    const runtime = props.runtimeHandle;
    if (!runtime) return;
    if (foveation !== undefined) runtime.loading.setFoveation(foveation);
    if (tilesetMinResolutionPx !== undefined)
      runtime.loading.setTilesetMinResolution(
        tilesetMinResolutionPx > 0 ? tilesetMinResolutionPx : null
      );
    if (parseJobs !== undefined) runtime.loading.setParseConcurrency(parseJobs);
    if (cacheBudgetMB !== undefined)
      runtime.loading.setCacheBudget(cacheBudgetMB * 1024 * 1024);
    if (
      [foveation, tilesetMinResolutionPx, parseJobs, cacheBudgetMB].some(
        (value) => value !== undefined
      )
    )
      props.map.triggerRepaint();
  }, [
    props.map,
    props.runtimeHandle,
    foveation,
    tilesetMinResolutionPx,
    parseJobs,
    cacheBudgetMB,
  ]);

  const button = (
    <button
      type="button"
      data-test-id="tile-loading-debug-open"
      aria-label="Tile diagnostics"
      title="Enable / disable tile diagnostics"
      aria-pressed={enabled}
      disabled={!props.runtimeHandle}
      onClick={() => {
        changeOptions({ telemetryEnabled: !enabled });
        changeOpen(!enabled);
      }}
    >
      <FontAwesomeIcon icon={faBug} />
    </button>
  );
  return (
    <>
      <div
        ref={toolbarRef}
        className={styles.toolbar}
        role="toolbar"
        aria-label="Tile manager diagnostics"
        data-test-id="mesh-coverage-toolbar"
        style={{
          position: "absolute",
          ...position,
          zIndex: 20,
          width: "max-content",
          maxWidth: "calc(100% - 16px)",
        }}
      >
        <button
          type="button"
          className={styles.grip}
          aria-label="Move debug toolbar"
          title="Drag to move; arrow keys to reposition"
          onPointerDown={(event) => {
            if (event.button !== 0 || !toolbarRef.current) return;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: toolbarRef.current.offsetLeft,
              top: toolbarRef.current.offsetTop,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            const bar = toolbarRef.current;
            if (!start || !bar) return;
            const parent = bar.offsetParent as HTMLElement | null;
            // Move only the toolbar DOM, not the diagnostics/render tree.
            bar.style.left = `${Math.max(
              0,
              Math.min(
                start.left + event.clientX - start.x,
                (parent?.clientWidth ?? window.innerWidth) - bar.offsetWidth
              )
            )}px`;
            bar.style.top = `${Math.max(
              0,
              Math.min(
                start.top + event.clientY - start.y,
                (parent?.clientHeight ?? window.innerHeight) - bar.offsetHeight
              )
            )}px`;
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            const bar = toolbarRef.current;
            if (drag.current && bar)
              setPosition({ left: bar.offsetLeft, top: bar.offsetTop });
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key
              )
            )
              return;
            event.preventDefault();
            setPosition((current) => ({
              left: Math.max(
                0,
                current.left +
                  (event.key === "ArrowLeft"
                    ? -10
                    : event.key === "ArrowRight"
                    ? 10
                    : 0)
              ),
              top: Math.max(
                0,
                current.top +
                  (event.key === "ArrowUp"
                    ? -10
                    : event.key === "ArrowDown"
                    ? 10
                    : 0)
              ),
            }));
          }}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        {button}
        <div ref={setToolbarHost} style={{ minWidth: 0, overflowX: "auto" }} />
      </div>
      {enabled && toolbarHost && (
        <Suspense fallback={null}>
          <Content
            {...props}
            toolbarHost={toolbarHost}
            options={options}
            open
            onOpenChange={changeOpen}
            onOptionsChange={changeOptions}
          />
        </Suspense>
      )}
    </>
  );
};
