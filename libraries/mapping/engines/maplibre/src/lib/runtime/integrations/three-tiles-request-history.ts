import type { Tile } from "3d-tiles-renderer/core";

type RequestPhase = {
  id: number;
  kind: "initial" | "move" | "zoom";
  startedAt: number;
  zoom: number | null;
  shadows: boolean;
  started: number;
  payloads: number;
  metadata: number;
  repeated: number;
};

/** Always-on, bounded counters of native tile request starts, including retries.
 * A cache-backed metadata admission is not necessarily a wire request. Network
 * traces measure that separately. No URL lists, resource observers or timers.
 * State belongs to one renderer; learned device limits cannot share it.
 */
export const createThreeTilesRequestHistory = () => {
  const phases: RequestPhase[] = [];
  const totals = { started: 0, payloads: 0, metadata: 0, repeated: 0 };
  const seen = new WeakSet<Tile>();
  let sequence = 0;
  const begin = (zoom: number | null, shadows: boolean) => {
    const phase: RequestPhase = {
      id: sequence++,
      kind: phases.length ? "move" : "initial",
      startedAt: performance.now(),
      zoom,
      shadows,
      started: 0,
      payloads: 0,
      metadata: 0,
      repeated: 0,
    };
    phases.push(phase);
    if (phases.length > 32) phases.shift();
    return phase;
  };
  begin(null, false);
  const observeView = (zoom: number | undefined, shadows: boolean) => {
    const phase = phases[phases.length - 1];
    if (zoom !== undefined && Number.isFinite(zoom)) {
      if (phase.zoom === null) phase.zoom = zoom;
      else if (phase.kind !== "initial" && Math.abs(zoom - phase.zoom) > 1e-5)
        phase.kind = "zoom";
    }
    phase.shadows = shadows;
    return phase;
  };
  return {
    totals,
    phases,
    begin,
    observeView,
    started: (tile: Tile, zoom: number | undefined, shadows: boolean) => {
      const phase = observeView(zoom, shadows);
      const metadata = Number(tile.internal?.hasUnrenderableContent === true);
      const repeated = Number(seen.has(tile));
      seen.add(tile);
      for (const counter of [totals, phase]) {
        counter.started++;
        counter.metadata += metadata;
        counter.payloads += 1 - metadata;
        counter.repeated += repeated;
      }
    },
  };
};
