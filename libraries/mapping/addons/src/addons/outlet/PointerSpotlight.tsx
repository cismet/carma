import { useEffect, useRef } from "react";

import {
  isPointerSample,
  pointerToPixels,
  type PointerBox,
  type PointerChannel,
  type PointerSample,
} from "@carma-mapping/show-remote";

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
 * and draws over the model rectangle.
 */
export const PointerSpotlight = ({
  base,
  channel,
  box,
}: {
  base: string;
  channel: PointerChannel;
  box: PointerBox | null;
}) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const receivedRef = useRef<Received | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    receivedRef.current = null;
    const subscription = subscribe({
      base,
      code: channel.session,
      onState: (state, meta) => {
        if (!isPointerSample(state)) {
          console.warn(`${LOG_PREFIX} ignoring a malformed sample`, state);
          return;
        }
        receivedRef.current = {
          sample: state,
          receivedAt: performance.now(),
          ageMs: meta.ageMs,
        };
      },
    });
    console.info(`${LOG_PREFIX} following ${channel.session}`);
    return () => {
      subscription.stop();
    };
    // a new epoch subscribes again even to the same session
  }, [base, channel.session, channel.epoch]);

  useEffect(() => {
    let frame = 0;
    let lastAt = performance.now();
    let drawn: { x: number; y: number } | null = null;
    let lastStyle = "";
    let lastVisible = false;

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const element = elementRef.current;
      const received = receivedRef.current;
      const dt = Math.max(now - lastAt, 0);
      lastAt = now;
      if (!element || !received) {
        return;
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

      const radius = Math.max(sample.radius * area.width, 1);
      const inner = radius * (1 - EDGE_SOFTNESS);
      const outer = radius * (1 + EDGE_SOFTNESS);
      const dim = Math.min(Math.max(sample.dim, 0), 1);
      const style = `radial-gradient(circle at ${drawn.x.toFixed(
        1
      )}px ${drawn.y.toFixed(1)}px, rgba(0,0,0,0) ${inner.toFixed(
        1
      )}px, rgba(0,0,0,${dim}) ${outer.toFixed(1)}px)`;
      if (style !== lastStyle) {
        element.style.background = style;
        lastStyle = style;
      }
      if (visible !== lastVisible) {
        element.style.opacity = visible ? "1" : "0";
        lastVisible = visible;
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={elementRef}
      style={{
        position: "fixed",
        inset: 0,
        opacity: 0,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: "none",
        // over the bounds box, under the blackout
        zIndex: 9999,
      }}
    />
  );
};
