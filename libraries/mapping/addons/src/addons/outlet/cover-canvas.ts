import type { Map as LibreMap } from "maplibre-gl";

import { lngLatToMercator } from "@carma-mapping/show-remote";

import type { CoverSource } from "../../lib/spot-cover";
import { projectHighlight } from "./highlight-geometry";

/** a bright spot cut out of a cover, in css pixels */
export type CoverHole = {
  x: number;
  y: number;
  radius: number;
  /** how open the hole is, 0 to 1 */
  presence: number;
  /** the soft edge as a share of the radius on either side of it */
  softness: number;
};

/** slow in, slow out, near enough to css `ease` */
export const ease = (share: number): number => share * share * (3 - 2 * share);

/**
 * The cab light's spots where the map shows them, for a canvas over the
 * window to cut out of its cover. Spots wholly off the window are left out.
 */
export const coverSourceHoles = (
  map: Pick<LibreMap, "project">,
  sources: readonly CoverSource[],
  view: { width: number; height: number }
): CoverHole[] => {
  const holes: CoverHole[] = [];
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
        spot.x - outer > view.width ||
        spot.y - outer > view.height
      ) {
        continue;
      }
      holes.push({ ...spot, presence: 1, softness: source.softness });
    }
  }
  return holes;
};

/**
 * A painter for a canvas over the window: everything `dim` dark but the
 * holes, each with a soft edge. Holes that overlap leave their union bright.
 * It paints only when the picture changed, since the window is
 * screen-captured and a full repaint of it is not free.
 */
export const createCoverPainter = () => {
  let lastSignature = "";

  return (
    canvas: HTMLCanvasElement,
    dim: number,
    holes: readonly CoverHole[]
  ): void => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    const signature = [
      width,
      height,
      dim,
      ...holes.map(
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
    for (const { x, y, radius, presence, softness } of holes) {
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
};
