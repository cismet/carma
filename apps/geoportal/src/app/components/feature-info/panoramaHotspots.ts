// Pure panorama helpers for the geoportal infobox: the style conf, the yaw
// calibration and the navigation hotspots around the selected pano.
import type maplibregl from "maplibre-gl";
import type { PanoramaHotspot } from "@carma-appframeworks/portals";

// Panorama: live-rotate the selected arrow on the map to follow the viewing
// direction inside the 360° viewer. The style layer that renders the selected
// arrow (see oelberg_panorama style.json). Only the selected feature is visible
// in that layer, so overriding the layer-wide icon-rotate to a constant rotates
// just the visible arrow; we restore the data-driven value on deselect.
export const PANORAMA_SELECTION_ARROW_LAYER = "selection-arrow";
// Calibration: map icon-rotate is clockwise-from-north (deg); pannellum yaw is
// degrees from the image centre (positive to the right). Tune sign/offset once
// against the live behaviour.
export const PANORAMA_YAW_SIGN = 1;
export const PANORAMA_YAW_OFFSET = 0;
// The panorama image's yaw=0 (centre) faces the BACK of the survey car, so the
// viewer must START rotated 180° to look forward (down the street / toward the
// next pano). This lives on the IMAGE (pannellum initial yaw), NOT on the arrow:
// the arrow already follows getYaw(), so with the image rotated the arrow tracks
// correctly and stays in sync with what is on screen. A style can override it
// in its metadata.carmaConf.panorama (see PanoramaConf).
export const PANORAMA_INITIAL_YAW = 180;

// Panorama settings a style declares about itself in metadata.carmaConf.panorama
// (layerUtils merges the style's carmaConf into the layer's conf), e.g. the
// Schwebebahn: { "initialYaw": 0, "keepViewOnHop": true }.
export type PanoramaConf = {
  // view yaw a pano opens at; default PANORAMA_INITIAL_YAW. The Schwebebahn
  // camera sits at the rear of the train, so forward looks into the waggon.
  initialYaw: number;
  // hops never reset the view (see PanoramaViewer keepViewOnHop), e.g. for
  // the Schwebebahn with two trips
  keepViewOnHop: boolean;
  // URL of a PanoramaStations file: places the viewer offers to jump to
  stations?: string;
};

export const readPanoramaConf = (conf: unknown): PanoramaConf => {
  const panorama = (conf as { panorama?: Record<string, unknown> } | undefined)
    ?.panorama;
  const initialYaw = Number(panorama?.initialYaw);
  return {
    initialYaw:
      panorama?.initialYaw != null && Number.isFinite(initialYaw)
        ? initialYaw
        : PANORAMA_INITIAL_YAW,
    keepViewOnHop: panorama?.keepViewOnHop === true,
    stations:
      typeof panorama?.stations === "string" ? panorama.stations : undefined,
  };
};

// Street-View navigation: pick the surrounding panos and render a clickable
// ground cross at each. The radius is generous so the line of panos down the
// street shows several steps out, receding toward the horizon.
export const PANORAMA_NEIGHBOR_RADIUS_M = 30;
export const PANORAMA_MAX_HOTSPOTS = 8;
// Drop a candidate that lands within this on-screen angular distance (combined
// yaw+pitch, deg) of an already-kept one. Crosses straight down the street
// share a yaw but differ in pitch, so thinning in (yaw, pitch) space keeps the
// receding line of targets while still removing true overlaps.
export const PANORAMA_MIN_HOTSPOT_SCREEN_SEP_DEG = 7;
// Assumed camera height above ground; together with the horizontal distance and
// the proj_z difference it sets how far below the horizon a hotspot sits.
export const PANORAMA_CAMERA_HEIGHT_M = 2.2;
export const PANORAMA_HOTSPOT_MIN_PITCH = -45;
export const PANORAMA_HOTSPOT_MAX_PITCH = 5;
// Arrow-key navigation: ↑ jumps to the neighbour nearest the current view, ↓ to
// the one behind it. Only consider neighbours within this angle of the target
// direction (a hemisphere), so ↑ never jumps to a pano clearly behind you.
export const PANORAMA_NAV_HEMISPHERE_DEG = 90;

// Wrap an angle (deg) into (-180, 180].
export const normalizeDeg = (deg: number): number => {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
};
export const angularDiffDeg = (a: number, b: number): number =>
  Math.abs(normalizeDeg(a - b));

// A pano's file_name is fully derivable from its integer fid: the names are
// always `pano_NNNNNN_NNNNNN` (6+6 digits) and fid is those 12 digits parsed as
// an int. So the baked neighbour list can carry only the fid (an int) and we
// reconstruct the file name here for the image URL / preload.
export const fidToFileName = (fid: number): string => {
  const s = String(fid).padStart(12, "0");
  return `pano_${s.slice(0, 6)}_${s.slice(6)}`;
};

// A single baked neighbour: [fid, bearing(deg, 0=N CW), distance(m), dz(m),
// heading(deg), sideStep?]. heading is the neighbour's own street orientation;
// optional on older tiles, so callers treat it as maybe-undefined. sideStep = 1
// marks a step sideways onto a parallel track (e.g. the other Schwebebahn trip):
// its heading runs along that track, so the cursor arrow aims at the cross.
export type BakedNeighbour = [number, number, number, number, number?, number?];

// Parse the per-feature `nb` property baked by the tiling pipeline (a compact
// JSON string of [fid, bearing, dist, dz] tuples). Returns null when absent or
// malformed so the caller can fall back to a live querySourceFeatures search.
export const parseBakedNeighbours = (nb: unknown): BakedNeighbour[] | null => {
  if (typeof nb !== "string" || nb.length === 0) return null;
  try {
    const parsed = JSON.parse(nb);
    return Array.isArray(parsed) ? (parsed as BakedNeighbour[]) : null;
  } catch {
    return null;
  }
};

// The style layer rendering the selected pano's arrow: the one on the pano
// source whose id ends with PANORAMA_SELECTION_ARROW_LAYER. That covers the
// plain oelberg_panorama style ("selection-arrow"), combined styles like
// oelberg_kombi ("panorama-selection-arrow") and the libre map, which prefixes
// every style layer id with the geoportal layer id.
export const findSelectionArrowLayer = (
  map: maplibregl.Map,
  sourceId: string
): string | undefined => {
  try {
    return map
      .getStyle()
      ?.layers?.find(
        (l) =>
          "source" in l &&
          l.source === sourceId &&
          l.id.endsWith(PANORAMA_SELECTION_ARROW_LAYER)
      )?.id;
  } catch {
    return undefined;
  }
};

// Everything the panorama code needs from the map that renders the selected
// pano: the map itself, the pano source, and the selection arrow layer (absent
// when the style has none).
export type PanoTarget = {
  map: maplibregl.Map;
  sourceId: string;
  sourceLayer?: string;
  arrowLayerId?: string;
  // true on the merged libre map: the selected feature-state is driven by the
  // MapSelectionContext (synced from the redux selection), so the panorama code
  // must not set or clear it itself.
  selectionStateManaged: boolean;
};

export type PanoramaHotspots = {
  hotspots: PanoramaHotspot[];
  // the kept neighbours' file names, so their images can be preloaded
  neighbourFileNames: string[];
};

// Build navigation hotspots from the panos surrounding the selected one
// (`props`: its source properties); `navigate` hops to a neighbour by fid.
export const buildPanoramaHotspots = (
  target: PanoTarget | null,
  props: Record<string, unknown> | undefined,
  navigate: (fid: number) => void
): PanoramaHotspots => {
  const empty: PanoramaHotspots = { hotspots: [], neighbourFileNames: [] };
  if (!target || !props) {
    return empty;
  }
  const { map, sourceId, sourceLayer } = target;
  const cHeading = Number(props.heading);
  const cFid = props.fid;
  if (!Number.isFinite(cHeading)) return empty;

  type Candidate = {
    fid: number;
    dist: number;
    dz: number;
    bearing: number;
    fileName?: string;
    /** The neighbour's own heading (deg, 0=N CW): its street orientation. */
    headingDeg?: number;
    /** Sideways step onto a parallel track: aim the arrow at the cross. */
    sideStep?: boolean;
  };
  const candidates: Candidate[] = [];

  // Prefer the baked neighbour list: it rides inside the pano's own vector
  // tile, so it is viewport-independent and available the instant the pano is
  // selected. querySourceFeatures only sees the current viewport, so it drops
  // neighbours across a tile border or when zoomed in. The fallback below
  // keeps things working for data that does not carry `nb` yet (e.g. before
  // the pipeline is redeployed).
  const baked = parseBakedNeighbours((props as { nb?: unknown }).nb);
  if (baked) {
    for (const entry of baked) {
      if (!Array.isArray(entry) || entry.length < 4) continue;
      const fid = Number(entry[0]);
      const bearing = Number(entry[1]);
      const dist = Number(entry[2]);
      const dz = Number(entry[3]);
      const headingDeg = Number(entry[4]);
      if (!Number.isFinite(fid) || fid === cFid) continue;
      if (!Number.isFinite(dist) || dist < 0.01) continue;
      if (dist > PANORAMA_NEIGHBOR_RADIUS_M) continue;
      candidates.push({
        fid,
        dist,
        dz: Number.isFinite(dz) ? dz : 0,
        bearing: Number.isFinite(bearing) ? bearing : 0,
        fileName: fidToFileName(fid),
        headingDeg: Number.isFinite(headingDeg) ? headingDeg : undefined,
        sideStep: entry[5] === 1,
      });
    }
  } else {
    const cx = Number(props.proj_x);
    const cy = Number(props.proj_y);
    const cz = Number(props.proj_z);
    if (Number.isNaN(cx) || Number.isNaN(cy)) return empty;

    let all: Array<{ properties?: Record<string, number> }> = [];
    try {
      all = map.querySourceFeatures(sourceId, { sourceLayer }) as Array<{
        properties?: Record<string, number>;
      }>;
    } catch {
      return empty;
    }

    const seen = new Set<number>();
    for (const f of all) {
      const p = f?.properties;
      if (!p || p.fid === cFid || seen.has(p.fid)) continue;
      seen.add(p.fid);
      const px = Number(p.proj_x);
      const py = Number(p.proj_y);
      if (Number.isNaN(px) || Number.isNaN(py)) continue;
      const dE = px - cx;
      const dN = py - cy;
      const dist = Math.hypot(dE, dN);
      if (dist < 0.01 || dist > PANORAMA_NEIGHBOR_RADIUS_M) continue;
      const dz = Number(p.proj_z) - cz;
      const bearing = (Math.atan2(dE, dN) * 180) / Math.PI; // 0=N, clockwise
      const rawFileName = (p as { file_name?: unknown }).file_name;
      const pHeading = Number(p.heading);
      candidates.push({
        fid: p.fid,
        dist,
        dz: Number.isNaN(dz) ? 0 : dz,
        bearing,
        fileName: typeof rawFileName === "string" ? rawFileName : undefined,
        headingDeg: Number.isFinite(pHeading) ? pHeading : undefined,
      });
    }
  }

  // Project each candidate into the panorama: yaw from the bearing/heading
  // calibration, pitch from the camera height and distance. We need both up
  // front so the declutter can work in on-screen space.
  type Projected = Candidate & { yaw: number; pitch: number };
  const projected: Projected[] = candidates.map((c) => {
    const yaw = normalizeDeg(
      (c.bearing - cHeading - PANORAMA_YAW_OFFSET) / PANORAMA_YAW_SIGN
    );
    const pitch = Math.max(
      PANORAMA_HOTSPOT_MIN_PITCH,
      Math.min(
        PANORAMA_HOTSPOT_MAX_PITCH,
        (Math.atan2(c.dz - PANORAMA_CAMERA_HEIGHT_M, c.dist) * 180) / Math.PI
      )
    );
    return { ...c, yaw, pitch };
  });

  // Nearest first, then thin by on-screen separation in (yaw, pitch): panos
  // straight down the street share a yaw but differ in pitch, so this keeps
  // the receding line of crosses toward the horizon instead of collapsing it
  // to a single target.
  projected.sort((a, b) => a.dist - b.dist);
  const kept: Projected[] = [];
  for (const c of projected) {
    if (kept.length >= PANORAMA_MAX_HOTSPOTS) break;
    const clashes = kept.some((k) => {
      const dYaw = normalizeDeg(k.yaw - c.yaw);
      const dPitch = k.pitch - c.pitch;
      return Math.hypot(dYaw, dPitch) < PANORAMA_MIN_HOTSPOT_SCREEN_SEP_DEG;
    });
    if (!clashes) kept.push(c);
  }

  // Make sure each target carries its neighbour's heading so the cursor arrow
  // can visualise that point's orientation. Baked `nb` written before the
  // heading field won't have it, so read it from the live source (the
  // neighbour is within 30 m, hence in a loaded tile). No-ops once the tiles
  // bake heading and on the fallback path (which already has it).
  if (kept.some((c) => c.headingDeg == null)) {
    try {
      const all = map.querySourceFeatures(sourceId, {
        sourceLayer,
      }) as Array<{ properties?: Record<string, number> }>;
      const headingByFid = new Map<number, number>();
      for (const f of all) {
        const p = f?.properties;
        if (!p || p.fid == null || headingByFid.has(p.fid)) continue;
        const hd = Number(p.heading);
        if (Number.isFinite(hd)) headingByFid.set(p.fid, hd);
      }
      for (const c of kept) {
        if (c.headingDeg == null) {
          const hd = headingByFid.get(c.fid);
          if (hd != null) c.headingDeg = hd;
        }
      }
    } catch {
      // ignore — heading stays undefined; arrow falls back to the bearing
    }
  }

  const hotspots = kept.map((c) => {
    // Aim the cursor arrow along the neighbour's OWN street (its heading), not
    // the bearing to it — at a junction those differ. Put the heading into the
    // same yaw frame as the cross, then pick the sense (heading or +180) that
    // points toward the neighbour, so the arrow points the way you'd travel.
    let streetYaw = c.yaw;
    if (!c.sideStep && c.headingDeg != null && Number.isFinite(c.headingDeg)) {
      const hy = normalizeDeg(
        (c.headingDeg - cHeading - PANORAMA_YAW_OFFSET) / PANORAMA_YAW_SIGN
      );
      const hyOpp = normalizeDeg(hy + 180);
      streetYaw =
        angularDiffDeg(hy, c.yaw) <= angularDiffDeg(hyOpp, c.yaw) ? hy : hyOpp;
    }
    return {
      id: `pano-nav-${c.fid}`,
      pitch: c.pitch,
      yaw: c.yaw,
      streetYaw,
      distanceM: c.dist,
      cssClass: "carma-pano-cross-hotspot",
      clickHandlerFunc: () => navigate(c.fid),
    };
  });

  const neighbourFileNames = kept
    .map((c) => c.fileName)
    .filter((n): n is string => !!n);

  return { hotspots, neighbourFileNames };
};
