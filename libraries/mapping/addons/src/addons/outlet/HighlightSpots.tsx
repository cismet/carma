import { useEffect, useRef } from "react";
import type { Map as LibreMap } from "maplibre-gl";

import {
  HIGHLIGHT_EDGE_SOFTNESS,
  lngLatToMercator,
  type HighlightSpot,
} from "@carma-mapping/show-remote";

import { coverSourcesOf, setCoverTakeover } from "../../lib/spot-cover";
import { projectHighlight } from "./highlight-geometry";

/** the whole cover fades like the pointer's spot does */
const FADE_MS = 200;
/** a spot switched on or off while others stay lit opens or closes this fast */
const SPOT_FADE_MS = 300;

/** slow in, slow out, near enough to css `ease` */
const ease = (share: number): number => share * share * (3 - 2 * share);

type Entry = {
  spot: HighlightSpot;
  /** how open the spot is drawn, 0 to 1 */
  presence: number;
  /** where `presence` is heading: 1 while the remote has it on */
  target: 0 | 1;
};

/**
 * The scene's stored highlights the remote switched on: everything goes dark
 * but the spots, like the pointer's flashlight with several spots at once.
 *
 * A canvas over the window rather than a map layer, for the same reason the
 * pointer and the blackout are: the Schwebebahn puts its layers back on top
 * after every style change, and the flow field is a canvas of its own, so a
 * map layer would leave them bright. The spots are cut out of one dark fill,
 * so two spots that overlap leave their union bright instead of darkening
 * each other the way stacked single-spot covers would.
 *
 * The pointer wins over the highlights: while the presenter holds it, they
 * fade out, and they come back when the pointer is let go (`suppressed`).
 *
 * The Schwebebahn's cab light darkens the map as well, from inside it. While
 * the cover is shown it darkens for both: it cuts the cab spots out too, takes
 * the stronger of the two dims, and tells the map's cover how far it has faded
 * in, which the cab light steps back by (`lib/spot-cover.ts`). The fade is
 * driven here rather than by a css transition, so the two stay in step.
 *
 * The canvas is redrawn only when a spot moved on screen, grew, or faded,
 * since the window is screen-captured and a full repaint of it is not free.
 */
export const HighlightSpots = ({
  map,
  spots,
  suppressed,
}: {
  map: LibreMap | null;
  spots: readonly HighlightSpot[] | null;
  suppressed: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entriesRef = useRef(new Map<string, Entry>());
  const visibleRef = useRef(false);
  const mapRef = useRef(map);
  mapRef.current = map;
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  // the remote's list, merged into what is drawn
  useEffect(() => {
    const entries = entriesRef.current;
    const wanted = spots ?? [];
    const wasLit = [...entries.values()].some(({ target }) => target === 1);
    for (const entry of entries.values()) {
      entry.target = 0;
    }
    for (const spot of wanted) {
      const entry = entries.get(spot.id);
      if (entry) {
        entry.spot = spot;
        entry.target = 1;
      } else {
        // next to lit spots a new one opens; on a dark cover it comes up
        // with the cover's own fade
        entries.set(spot.id, {
          spot,
          presence: wasLit && visibleRef.current ? 0 : 1,
          target: 1,
        });
      }
    }
  }, [spots]);

  useEffect(() => {
    let frame = 0;
    let lastAt = performance.now();
    let lastSignature = "";
    /** how far the cover has faded in, 0 to 1, before easing */
    let share = 0;
    /** the map whose cover this canvas has told how far it took over */
    let coverMap: LibreMap | null = null;

    /** fades the canvas and tells the cab light how far to step back */
    const showShare = (map: LibreMap | null): void => {
      const shown = ease(share);
      if (canvasRef.current) {
        canvasRef.current.style.opacity = String(shown);
      }
      if (map) {
        setCoverTakeover(map, shown);
        // the cab light only reads it when the map draws a frame
        map.triggerRepaint();
      }
    };

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      const map = mapRef.current;
      const entries = entriesRef.current;
      const dt = Math.max(now - lastAt, 0);
      lastAt = now;
      if (!canvas) {
        return;
      }

      if (map !== coverMap) {
        if (coverMap) {
          setCoverTakeover(coverMap, 0);
          coverMap.triggerRepaint();
        }
        coverMap = map;
        showShare(map);
      }

      const lit = [...entries.values()].some(({ target }) => target === 1);
      const visible = lit && !suppressedRef.current;
      visibleRef.current = visible;
      const nextShare = visible
        ? Math.min(share + dt / FADE_MS, 1)
        : Math.max(share - dt / FADE_MS, 0);
      if (nextShare !== share) {
        share = nextShare;
        showShare(map);
      }

      if (visible) {
        // single spots open and close while the cover stays
        const step = dt / SPOT_FADE_MS;
        for (const [id, entry] of entries) {
          entry.presence =
            entry.target === 1
              ? Math.min(entry.presence + step, 1)
              : Math.max(entry.presence - step, 0);
          if (entry.target === 0 && entry.presence === 0) {
            entries.delete(id);
          }
        }
      } else if (share === 0) {
        // the cover has faded with the spots as they were; now forget the
        // ones switched off, so they do not show when it comes back
        for (const [id, entry] of entries) {
          if (entry.target === 0) {
            entries.delete(id);
          }
        }
      }

      if (!map || entries.size === 0 || share === 0) {
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(window.innerWidth * ratio);
      const height = Math.round(window.innerHeight * ratio);
      const drawn = [...entries.values()].map((entry) => ({
        ...projectHighlight(map, entry.spot),
        presence: entry.presence,
        softness: HIGHLIGHT_EDGE_SOFTNESS,
      }));
      // the cab light's spots, cut out of the same cover
      const sources = coverSourcesOf(map);
      for (const source of sources) {
        for (const { lon, lat } of source.centres) {
          const spot = projectHighlight(map, {
            center: lngLatToMercator([lon, lat]),
            radiusMeters: source.radiusMeters,
          });
          const outer = spot.radius * (1 + source.softness);
          if (
            spot.x + outer < 0 ||
            spot.y + outer < 0 ||
            spot.x - outer > window.innerWidth ||
            spot.y - outer > window.innerHeight
          ) {
            continue;
          }
          drawn.push({ ...spot, presence: 1, softness: source.softness });
        }
      }
      const shown = [...entries.values()].filter(
        ({ target }) => target === 1
      );
      const dim = Math.min(
        Math.max(
          ...(shown.length > 0 ? shown : [...entries.values()]).map(
            ({ spot }) => spot.dim
          ),
          ...sources.map((source) => source.dim),
          0
        ),
        1
      );
      const signature = [
        width,
        height,
        dim,
        ...drawn.map(
          ({ x, y, radius, presence, softness }) =>
            `${x.toFixed(1)},${y.toFixed(1)},${radius.toFixed(
              1
            )},${presence.toFixed(3)},${softness}`
        ),
      ].join("|");
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.fillStyle = `rgba(0,0,0,${dim})`;
      context.fillRect(0, 0, window.innerWidth, window.innerHeight);
      context.globalCompositeOperation = "destination-out";
      for (const { x, y, radius, presence, softness } of drawn) {
        if (presence <= 0) {
          continue;
        }
        const outer = radius * (1 + softness);
        const inner = radius * (1 - softness);
        const gradient = context.createRadialGradient(x, y, 0, x, y, outer);
        gradient.addColorStop(inner / outer, `rgba(0,0,0,${presence})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, outer, 0, Math.PI * 2);
        context.fill();
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      if (coverMap) {
        setCoverTakeover(coverMap, 0);
        coverMap.triggerRepaint();
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0,
        pointerEvents: "none",
        // over the bounds box, like the pointer's spot; under the blackout
        zIndex: 9999,
      }}
    />
  );
};
