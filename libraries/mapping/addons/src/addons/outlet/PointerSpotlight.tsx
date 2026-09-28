import { useEffect, useRef } from "react";
import type { Map as LibreMap } from "maplibre-gl";

import {
  isPointerSample,
  pointerToPixels,
  type PointerBox,
  type PointerChannel,
  type PointerSample,
} from "@carma-mapping/show-remote";

import { coverSourcesOf, setCoverTakeover } from "../../lib/spot-cover";
import { coverSourceHoles, createCoverPainter, ease } from "./cover-canvas";
import { answerPointerLink } from "./pointer-link";
import { subscribe } from "./relay";

const LOG_PREFIX = "[OUTLET POINTER]";

/**
 * The spot is led along its velocity by the transport delay, but only by up
 * to this much: the phone's velocity estimate trails a sudden stop, and a
 * longer lead would overshoot there.
 */
const LEAD_MAX_MS = 60;
/** the drawn spot eases towards the target with this time constant */
const EASE_MS = 45;
/** a spot that has heard nothing for this long is taken as released */
const STALE_MS = 4000;
const FADE_MS = 200;
/** the spot's edge fades over this share of its radius, on either side */
const EDGE_SOFTNESS = 0.2;

type Received = { sample: PointerSample; receivedAt: number; ageMs: number };

/**
 * The pointer the remote steers: everything but a spot goes dark. Follows the
 * pointer session the state document names, which the phone opened itself,
 * and draws over the model rectangle. When the channel names a direct link
 * too, samples also come straight from the phone; the newest by `seq` wins,
 * whichever way it came.
 *
 * The Schwebebahn's cab light darkens the map as well, from inside it. While
 * the spot is lit, this canvas darkens for both, the way the stored
 * highlights do (`HighlightSpots`): it cuts the cab spots out too, takes the
 * stronger of the two dims, and tells the map's cover how far it has faded
 * in, which the cab light steps back by (`lib/spot-cover.ts`).
 */
export const PointerSpotlight = ({
  map,
  base,
  channel,
  box,
  onLitChange,
}: {
  map: LibreMap | null;
  base: string;
  channel: PointerChannel;
  box: PointerBox | null;
  /** told whenever the spot comes on or goes off, e.g. to hide other spots */
  onLitChange?: (lit: boolean) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const onLitChangeRef = useRef(onLitChange);
  onLitChangeRef.current = onLitChange;
  const receivedRef = useRef<Received | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;
  const offerSession = channel.direct?.offer;
  const answerSession = channel.direct?.answer;

  useEffect(() => {
    receivedRef.current = null;
    // the relay path brings the samples the direct one already brought, later
    const accept = (sample: PointerSample, ageMs: number) => {
      const current = receivedRef.current;
      if (current && sample.seq <= current.sample.seq) {
        return;
      }
      receivedRef.current = { sample, receivedAt: performance.now(), ageMs };
    };
    const subscription = subscribe({
      base,
      code: channel.session,
      onState: (state, meta) => {
        if (!isPointerSample(state)) {
          console.warn(`${LOG_PREFIX} ignoring a malformed sample`, state);
          return;
        }
        accept(state, meta.ageMs);
      },
    });
    // a sample over the direct link is a few milliseconds old at most
    const link =
      offerSession && answerSession
        ? answerPointerLink({
            base,
            sessions: { offer: offerSession, answer: answerSession },
            onSample: (sample) => accept(sample, 0),
          })
        : null;
    console.info(`${LOG_PREFIX} following ${channel.session}`);
    return () => {
      subscription.stop();
      link?.stop();
    };
    // a new epoch subscribes again even to the same session
  }, [base, channel.session, channel.epoch, offerSession, answerSession]);

  useEffect(() => {
    let frame = 0;
    let lastAt = performance.now();
    let drawn: { x: number; y: number } | null = null;
    let lastVisible = false;
    const paint = createCoverPainter();
    /** what this canvas writes its takeover under */
    const writer = {};
    /** how far the spot has faded in, 0 to 1, before easing */
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
        setCoverTakeover(map, writer, shown);
        // the cab light only reads it when the map draws a frame
        map.triggerRepaint();
      }
    };

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      const map = mapRef.current;
      const received = receivedRef.current;
      const dt = Math.max(now - lastAt, 0);
      lastAt = now;
      if (!canvas || !received) {
        return;
      }

      if (map !== coverMap) {
        if (coverMap) {
          setCoverTakeover(coverMap, writer, 0);
          coverMap.triggerRepaint();
        }
        coverMap = map;
        showShare(map);
      }

      const { sample, receivedAt, ageMs } = received;
      const sinceReceipt = now - receivedAt;
      const visible = sample.on && sinceReceipt < STALE_MS;

      const area: PointerBox = boxRef.current ?? {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const lead = sample.on
        ? Math.min(ageMs + sinceReceipt, LEAD_MAX_MS) / 1000
        : 0;
      const target = pointerToPixels(
        area,
        sample.dx + sample.vx * lead,
        sample.dy + sample.vy * lead
      );
      // a spot that was hidden appears where it is, not gliding in
      if (!drawn || !lastVisible) {
        drawn = target;
      } else {
        const k = 1 - Math.exp(-dt / EASE_MS);
        drawn = {
          x: drawn.x + (target.x - drawn.x) * k,
          y: drawn.y + (target.y - drawn.y) * k,
        };
      }
      if (visible !== lastVisible) {
        lastVisible = visible;
        onLitChangeRef.current?.(visible);
      }

      const nextShare = visible
        ? Math.min(share + dt / FADE_MS, 1)
        : Math.max(share - dt / FADE_MS, 0);
      if (nextShare !== share) {
        share = nextShare;
        showShare(map);
      }
      if (share === 0) {
        return;
      }

      const view = { width: window.innerWidth, height: window.innerHeight };
      const sources = map ? coverSourcesOf(map) : [];
      const dim = Math.min(
        Math.max(sample.dim, ...sources.map((source) => source.dim), 0),
        1
      );
      paint(canvas, dim, [
        {
          ...drawn,
          radius: Math.max(sample.radius * area.width, 1),
          presence: 1,
          softness: EDGE_SOFTNESS,
        },
        // the cab light's spots, cut out of the same cover
        ...(map ? coverSourceHoles(map, sources, view) : []),
      ]);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      if (coverMap) {
        setCoverTakeover(coverMap, writer, 0);
        coverMap.triggerRepaint();
      }
      // a closed pointer is not lit, whatever its last sample said
      if (lastVisible) {
        onLitChangeRef.current?.(false);
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
        // over the bounds box, under the blackout
        zIndex: 9999,
      }}
    />
  );
};
