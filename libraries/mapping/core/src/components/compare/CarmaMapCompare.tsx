import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import maplibregl from "maplibre-gl";
import { ComparePanel, CompareMapConfig } from "./ComparePanel";
import { SwipeOverlay } from "./SwipeOverlay";
import { SpyglassOverlay } from "./SpyglassOverlay";
import "./compare.css";

/** DIAGNOSTIC: console.log (not console.debug) so it survives Chrome's
 *  default level filter. Flip to false once sync is confirmed working. */
const SYNC_LOG = true;
const log = (...args: unknown[]) => {
  if (SYNC_LOG) console.log("[COMPARE]", ...args);
};

// Attach a stable id to each map instance the first time we see it.
// Lets every log identify which specific instance produced an event.
let _nextCompareIdx = 0;
function tagMap(map: maplibregl.Map): number {
  const tagged = map as unknown as { _compareIdx?: number };
  if (tagged._compareIdx == null) {
    tagged._compareIdx = _nextCompareIdx++;
  }
  return tagged._compareIdx;
}
function idOf(map: maplibregl.Map): number | string {
  return (map as unknown as { _compareIdx?: number })._compareIdx ?? "?";
}

export type CompareMode =
  | {
      type: "spyglass";
      radius?: number;
      overlayMapIndex?: number;
    }
  | {
      type: "side-by-side";
      orientation?: "horizontal" | "vertical";
      /**
       * Initial split positions as fractions in (0,1), length = maps.length - 1.
       * When omitted, panels are distributed equally.
       */
      initialSplit?: number[];
    };

export interface CarmaMapCompareProps {
  /** Two or more map configurations to compare. */
  maps: CompareMapConfig[];
  /** Comparison mode and its options. */
  mode: CompareMode;
  overrideGlyphs?: string;
  preserveDrawingBuffer?: boolean;
  interactive?: boolean;
  debugLog?: boolean;
  logErrors?: boolean;
  /** Fires once all map instances have been created. */
  onMapsReady?: (maps: Array<maplibregl.Map>) => void;
  /** Fires when the user wheels over the spyglass ring. Parent should
   *  update its `mode.radius` on the next render so the Lupe visually
   *  reflects the new size. Optional; when omitted, wheel-over-Lupe is
   *  a no-op (and falls through to whatever is beneath). */
  onSpyglassRadiusChange?: (radius: number) => void;
}

function equalSplit(n: number): number[] {
  if (n <= 1) return [];
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(i / n);
  return out;
}

/**
 * Compare UI modelled after mapbox-gl-compare.
 *
 * Every map renders the SAME geographic area into its own full-size
 * absolute container, stacked on top of each other inside a
 * `position: relative` wrapper. A `clip-path` on each panel hides the
 * columns / rows / everything-outside-a-circle that belong to another
 * panel.
 *
 * ── Camera sync ───────────────────────────────────────────────
 * Subscription to each map's `move` event happens INSIDE
 * `handlePanelReady`, not in a `useEffect`. A useEffect-based
 * subscription races with the LibreMap-init useEffect that destroys
 * and recreates the MapLibre instance under `<StrictMode>`, so we
 * end up with `move` handlers on destroyed v1 maps and nothing on
 * the live v2 maps the user is actually dragging. Subscribing the
 * moment a map arrives at this callback is timing-agnostic.
 *
 * The sync itself follows the mapbox-gl-sync-move pattern: turn all
 * listeners off, `jumpTo` every target from the source's camera,
 * turn all listeners back on. We also filter by `e.originalEvent`
 * as defence in depth: programmatic moves (our own `jumpTo`) don't
 * carry one, user drags / wheels / keystrokes do.
 */
export function CarmaMapCompare({
  maps,
  mode,
  overrideGlyphs,
  preserveDrawingBuffer,
  interactive,
  debugLog,
  logErrors,
  onMapsReady,
  onSpyglassRadiusChange,
}: CarmaMapCompareProps) {
  // Stable per-index div refs for the stacked panels.
  const panelRefsContainer = useRef<
    Array<{ current: HTMLDivElement | null }>
  >([]);
  if (panelRefsContainer.current.length !== maps.length) {
    const next: Array<{ current: HTMLDivElement | null }> = [];
    for (let i = 0; i < maps.length; i++) {
      next.push(panelRefsContainer.current[i] ?? { current: null });
    }
    panelRefsContainer.current = next;
  }
  const panelRefs = panelRefsContainer.current;

  const containerRef = useRef<HTMLDivElement | null>(null);

  // ─── Sync state kept in refs (not React state) ─────────────────
  // liveMapsRef: which map instance is currently assigned to which panel index.
  //   Updated in handlePanelReady. In StrictMode we replace v1 with v2
  //   here (and detach v1's listener first).
  // syncHandlersRef: the `move` handler each map is subscribed with, so
  //   we can detach it by identity later.
  // Both are refs so the `move` handler closes over the current state of
  // the comparison at the moment the event fires, not at the moment the
  // subscription happened.
  const liveMapsRef = useRef<Map<number, maplibregl.Map>>(new Map());
  const syncHandlersRef = useRef<
    Map<maplibregl.Map, (e: unknown) => void>
  >(new Map());

  // React state that mirrors "how many panels have reported in, and which
  // instances". Used for the resize-on-mode-change effect and for
  // onMapsReady. The sync itself does NOT depend on this state.
  const [mapInstances, setMapInstances] = useState<maplibregl.Map[]>([]);

  // Off/jump/on sync. Always reads from liveMapsRef so it sees the
  // current generation of maps even if the subscription was attached
  // against an older snapshot.
  const syncFrom = useCallback((source: maplibregl.Map) => {
    // Off ALL. During the jumpTo pass, no target (or source) can fire
    // "move" back into the handler. This is the mapbox-gl-sync-move
    // pattern and is what makes recursion impossible: jumped targets
    // emit "move" events, but their listeners are detached, so nothing
    // pings back.
    syncHandlersRef.current.forEach((fn, m) => {
      try {
        m.off("move", fn);
      } catch {
        /* disposed */
      }
    });

    const center = source.getCenter();
    const zoom = source.getZoom();
    const bearing = source.getBearing();
    const pitch = source.getPitch();

    let jumped = 0;
    liveMapsRef.current.forEach((target) => {
      if (target === source) return;
      try {
        target.jumpTo({
          center: [center.lng, center.lat],
          zoom,
          bearing,
          pitch,
        });
        jumped++;
        log("  jumped target id", idOf(target));
      } catch (err) {
        log("  jumpTo FAILED on target id", idOf(target), err);
      }
    });
    log(
      "syncFrom source id",
      idOf(source),
      "-> jumped",
      jumped,
      "of",
      liveMapsRef.current.size - 1,
      "target(s)"
    );

    // On ALL, using the SAME handler references (keyed by map).
    syncHandlersRef.current.forEach((fn, m) => {
      try {
        m.on("move", fn);
      } catch {
        /* disposed */
      }
    });
  }, []);

  const handlePanelReady = useCallback(
    (index: number, map: maplibregl.Map) => {
      const tag = tagMap(map);
      log("handlePanelReady called for panel index", index, "map id", tag);

      // If the same panel index already has a map (StrictMode remount or
      // any future re-mount), detach that old map's handler before we
      // lose the reference.
      const prev = liveMapsRef.current.get(index);
      if (prev && prev !== map) {
        const prevFn = syncHandlersRef.current.get(prev);
        if (prevFn) {
          try {
            prev.off("move", prevFn);
          } catch {
            /* disposed */
          }
          syncHandlersRef.current.delete(prev);
        }
        log(
          "  replaced old map (id",
          idOf(prev),
          ") at index",
          index,
          "with new map id",
          tag
        );
      }

      liveMapsRef.current.set(index, map);

      // Subscribe this map if it isn't already. The move handler does
      // NOT filter by originalEvent — the off/on dance in syncFrom is
      // what prevents recursion, and originalEvent is unreliable across
      // MapLibre event shapes.
      if (!syncHandlersRef.current.has(map)) {
        const fn = () => {
          log("move fired on map id", idOf(map), "(panel index", index, ")");
          syncFrom(map);
        };
        syncHandlersRef.current.set(map, fn);
        try {
          map.on("move", fn);
          log("  subscribed move listener on map id", tag, "(index", index, ")");
        } catch (err) {
          log("  subscribe FAILED on map id", tag, err);
        }
      }

      // React state mirror for the rest of the component (resize effect,
      // onMapsReady). Only fires when every panel has contributed.
      if (liveMapsRef.current.size === maps.length) {
        const allMaps: maplibregl.Map[] = [];
        for (let i = 0; i < maps.length; i++) {
          const m = liveMapsRef.current.get(i);
          if (m) allMaps.push(m);
        }
        log(
          "all",
          maps.length,
          "panels registered, setMapInstances with ids",
          allMaps.map(idOf)
        );
        setMapInstances(allMaps);
        onMapsReady?.(allMaps);
      }
    },
    [maps.length, onMapsReady, syncFrom]
  );

  // Real-unmount cleanup. Also covers StrictMode's mount-unmount-mount
  // dance: when the strict unmount fires this cleanup, refs are cleared,
  // and the strict remount lets the freshly created LibreMap instances
  // re-register via handlePanelReady.
  //
  // We deliberately do NOT have a separate [maps.length] effect that
  // wipes refs on mount: child useEffects (LibreMap's map-creation
  // effect) run BEFORE parent useEffects, so the parent firing a body
  // on mount would detach the listeners that handlePanelReady just
  // attached, leaving the visible maps with no `move` subscriber. If
  // maps.length grows or shrinks at runtime, handlePanelReady absorbs
  // the new panel, and disposed entries left in liveMapsRef are caught
  // by the try/catch in syncFrom.
  useEffect(() => {
    return () => {
      syncHandlersRef.current.forEach((fn, m) => {
        try {
          m.off("move", fn);
        } catch {
          /* disposed */
        }
      });
      syncHandlersRef.current.clear();
      liveMapsRef.current.clear();
    };
  }, []);

  // ─── Side-by-side split positions ──────────────────────────────
  const isSideBySide = mode.type === "side-by-side";
  const sbsOrientation =
    mode.type === "side-by-side"
      ? mode.orientation ?? "horizontal"
      : "horizontal";

  const [splitPositions, setSplitPositions] = useState<number[]>(() =>
    equalSplit(maps.length)
  );

  useEffect(() => {
    setSplitPositions(equalSplit(maps.length));
  }, [maps.length, mode.type, sbsOrientation]);

  // ─── 2x2 grid mode (side-by-side with exactly 4 maps) ─────────
  // The linear splitPositions array isn't expressive enough here; a
  // grid needs one fraction for the column split (x) and one for the
  // row split (y). When isGrid is false splitPositions wins and
  // gridSplit is ignored; when isGrid is true we flip over.
  const isGrid = isSideBySide && maps.length === 4;
  const [gridSplit, setGridSplit] = useState<{ x: number; y: number }>({
    x: 0.5,
    y: 0.5,
  });

  useEffect(() => {
    if (isGrid) setGridSplit({ x: 0.5, y: 0.5 });
  }, [isGrid]);

  // ─── Spyglass pointer position ─────────────────────────────────
  const [spyglassPos, setSpyglassPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (mode.type !== "spyglass") setSpyglassPos(null);
  }, [mode.type]);

  useEffect(() => {
    if (mode.type !== "spyglass") return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setSpyglassPos({ x: rect.width / 2, y: rect.height / 2 });
  }, [mode.type]);

  // ─── Resize maps after mode / layout changes ──────────────────
  useEffect(() => {
    if (mapInstances.length === 0) return;
    const raf = requestAnimationFrame(() => {
      mapInstances.forEach((m) => {
        try {
          m.resize();
        } catch {
          /* disposed */
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [mode.type, mapInstances, maps.length]);

  // ─── Per-panel clip-path ───────────────────────────────────────
  const clipPaths = useMemo<string[]>(() => {
    if (mode.type === "spyglass") {
      const overlayIdx = mode.overlayMapIndex ?? 1;
      const radius = mode.radius ?? 150;
      return maps.map((_, idx) => {
        if (idx !== overlayIdx) return "none";
        if (!spyglassPos) return "circle(0px at 0 0)";
        return `circle(${radius}px at ${spyglassPos.x}px ${spyglassPos.y}px)`;
      });
    }
    if (isGrid) {
      // 2x2 grid: M0 top-left, M1 top-right, M2 bottom-left, M3
      // bottom-right. inset(top right bottom left), where each value
      // is the distance from the respective edge as a percentage.
      const { x, y } = gridSplit;
      const xPct = (x * 100).toFixed(4);
      const yPct = (y * 100).toFixed(4);
      const rxPct = ((1 - x) * 100).toFixed(4);
      const ryPct = ((1 - y) * 100).toFixed(4);
      return [
        `inset(0 ${rxPct}% ${ryPct}% 0)`,
        `inset(0 0 ${ryPct}% ${xPct}%)`,
        `inset(${yPct}% ${rxPct}% 0 0)`,
        `inset(${yPct}% 0 0 ${xPct}%)`,
      ];
    }
    return maps.map((_, idx) => {
      const leftFrac = idx === 0 ? 0 : splitPositions[idx - 1] ?? 0;
      const rightFrac =
        idx === maps.length - 1 ? 1 : splitPositions[idx] ?? 1;
      const leftPct = (leftFrac * 100).toFixed(4);
      const rightPct = ((1 - rightFrac) * 100).toFixed(4);
      if (sbsOrientation === "horizontal") {
        return `inset(0 ${rightPct}% 0 ${leftPct}%)`;
      }
      return `inset(${leftPct}% 0 ${rightPct}% 0)`;
    });
  }, [mode, maps, splitPositions, sbsOrientation, spyglassPos, isGrid, gridSplit]);

  const spyglassOverlayIdx =
    mode.type === "spyglass" ? mode.overlayMapIndex ?? 1 : -1;

  return (
    <div
      ref={containerRef}
      className="carma-compare"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {maps.map((config, index) => (
        <div
          key={index}
          ref={(el) => {
            const entry = panelRefs[index];
            if (entry) entry.current = el;
          }}
          className="carma-compare-stacked-panel"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            clipPath: clipPaths[index],
            WebkitClipPath: clipPaths[index],
            zIndex: index === spyglassOverlayIdx ? 1 : 0,
          }}
        >
          <ComparePanel
            config={config}
            onMapReady={(map) => handlePanelReady(index, map)}
            overrideGlyphs={overrideGlyphs}
            preserveDrawingBuffer={preserveDrawingBuffer}
            interactive={interactive}
            debugLog={debugLog}
            logErrors={logErrors}
          />
        </div>
      ))}

      {isSideBySide && !isGrid &&
        maps.map((config, index) => {
          if (!config.label) return null;
          const leftFrac = index === 0 ? 0 : splitPositions[index - 1] ?? 0;
          const style: React.CSSProperties = {
            position: "absolute",
            zIndex: 3,
            pointerEvents: "none",
          };
          if (sbsOrientation === "horizontal") {
            style.left = `calc(${(leftFrac * 100).toFixed(4)}% + 16px)`;
            style.bottom = 16;
          } else {
            style.top = `calc(${(leftFrac * 100).toFixed(4)}% + 16px)`;
            style.left = 16;
          }
          return (
            <div
              key={`label-${index}`}
              className="carma-compare-panel-label"
              style={style}
            >
              {config.label}
            </div>
          );
        })}

      {isGrid &&
        maps.map((config, index) => {
          if (!config.label) return null;
          // Top-left corner of each quadrant, offset by 16 px inset.
          const leftFrac = index % 2 === 0 ? 0 : gridSplit.x;
          const topFrac = index < 2 ? 0 : gridSplit.y;
          const style: React.CSSProperties = {
            position: "absolute",
            zIndex: 3,
            pointerEvents: "none",
            left: `calc(${(leftFrac * 100).toFixed(4)}% + 16px)`,
            top: `calc(${(topFrac * 100).toFixed(4)}% + 16px)`,
          };
          return (
            <div
              key={`label-${index}`}
              className="carma-compare-panel-label"
              style={style}
            >
              {config.label}
            </div>
          );
        })}

      {isSideBySide && !isGrid && maps.length > 1 && (
        <SwipeOverlay
          orientation={sbsOrientation}
          positions={splitPositions}
          onPositionsChange={setSplitPositions}
        />
      )}

      {isGrid && (
        <>
          {/* Vertical line splitting the two columns. */}
          <SwipeOverlay
            orientation="horizontal"
            positions={[gridSplit.x]}
            onPositionsChange={([x]) =>
              setGridSplit((prev) => ({ ...prev, x }))
            }
          />
          {/* Horizontal line splitting the two rows. */}
          <SwipeOverlay
            orientation="vertical"
            positions={[gridSplit.y]}
            onPositionsChange={([y]) =>
              setGridSplit((prev) => ({ ...prev, y }))
            }
          />
        </>
      )}

      {mode.type === "spyglass" && (
        <SpyglassOverlay
          position={spyglassPos}
          radius={mode.radius}
          onPositionChange={setSpyglassPos}
          onRadiusChange={onSpyglassRadiusChange}
        />
      )}
    </div>
  );
}
