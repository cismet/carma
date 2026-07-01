import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  InfoBoxFotoPreview,
  LightBoxContext,
  LightBoxDispatchContext,
  defaultLightBoxCaptionFactory,
  type LightBoxCustomSlide,
  type LightBoxImageSlide,
  type LightBoxSlide,
} from "@carma-mapping/lightbox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";

import {
  setPreferredLayerId,
  setSelectedFeature,
  updateSecondaryInfoBoxElements,
  getInfoText,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  getLoading,
  moveFeatureToEnd,
  removeSecondaryInfoBoxElement,
  moveFeatureToFront,
  setPreferredVectorLayerId,
} from "../../store/slices/features";
import { getLayers, getMaplibreMaps } from "../../store/slices/mapping";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";

import versionData from "../../../version.json";
import {
  getApplicationVersion,
  isHtmlString,
  updateUrl,
} from "@carma-commons/utils";
import {
  InfoBox,
  InfoBoxHeader,
  utils,
  getActionLinksForFeature,
  PanoramaViewer,
  PanoramaPreview,
  type PanoramaHotspot,
} from "@carma-appframeworks/portals";
import { createFeature } from "../GeoportalMap/libremap.utils";
import { parseColor } from "../../helper/color";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import type { FeatureInfo } from "@carma-mapping/utils";
import { selectionPadding } from "../../constants/selection";

// Panorama: live-rotate the selected arrow on the map to follow the viewing
// direction inside the 360° viewer. The style layer that renders the selected
// arrow (see oelberg_panorama style.json). Only the selected feature is visible
// in that layer, so overriding the layer-wide icon-rotate to a constant rotates
// just the visible arrow; we restore the data-driven value on deselect.
const PANORAMA_SELECTION_ARROW_LAYER = "selection-arrow";
// Calibration: map icon-rotate is clockwise-from-north (deg); pannellum yaw is
// degrees from the image centre (positive to the right). Tune sign/offset once
// against the live behaviour.
const PANORAMA_YAW_SIGN = 1;
const PANORAMA_YAW_OFFSET = 0;
// The panorama image's yaw=0 (centre) faces the BACK of the survey car, so the
// viewer must START rotated 180° to look forward (down the street / toward the
// next pano). This lives on the IMAGE (pannellum initial yaw), NOT on the arrow:
// the arrow already follows getYaw(), so with the image rotated the arrow tracks
// correctly and stays in sync with what is on screen.
const PANORAMA_INITIAL_YAW = 180;

// Street-View navigation: pick the surrounding panos and render a clickable
// ground cross at each. The radius is generous so the line of panos down the
// street shows several steps out, receding toward the horizon.
const PANORAMA_NEIGHBOR_RADIUS_M = 30;
const PANORAMA_MAX_HOTSPOTS = 8;
// Drop a candidate that lands within this on-screen angular distance (combined
// yaw+pitch, deg) of an already-kept one. Crosses straight down the street
// share a yaw but differ in pitch, so thinning in (yaw, pitch) space keeps the
// receding line of targets while still removing true overlaps.
const PANORAMA_MIN_HOTSPOT_SCREEN_SEP_DEG = 7;
// Assumed camera height above ground; together with the horizontal distance and
// the proj_z difference it sets how far below the horizon a hotspot sits.
const PANORAMA_CAMERA_HEIGHT_M = 2.2;
const PANORAMA_HOTSPOT_MIN_PITCH = -45;
const PANORAMA_HOTSPOT_MAX_PITCH = 5;
// Arrow-key navigation: ↑ jumps to the neighbour nearest the current view, ↓ to
// the one behind it. Only consider neighbours within this angle of the target
// direction (a hemisphere), so ↑ never jumps to a pano clearly behind you.
const PANORAMA_NAV_HEMISPHERE_DEG = 90;

// Wrap an angle (deg) into (-180, 180].
const normalizeDeg = (deg: number): number => {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
};
const angularDiffDeg = (a: number, b: number): number =>
  Math.abs(normalizeDeg(a - b));

// A pano's file_name is fully derivable from its integer fid: the names are
// always `pano_NNNNNN_NNNNNN` (6+6 digits) and fid is those 12 digits parsed as
// an int. So the baked neighbour list can carry only the fid (an int) and we
// reconstruct the file name here for the image URL / preload.
const fidToFileName = (fid: number): string => {
  const s = String(fid).padStart(12, "0");
  return `pano_${s.slice(0, 6)}_${s.slice(6)}`;
};

// A single baked neighbour: [fid, bearing(deg, 0=N CW), distance(m), dz(m),
// heading(deg)]. heading is the neighbour's own street orientation; optional on
// older tiles, so callers treat it as maybe-undefined.
type BakedNeighbour = [number, number, number, number, number?];

// Parse the per-feature `nb` property baked by the tiling pipeline (a compact
// JSON string of [fid, bearing, dist, dz] tuples). Returns null when absent or
// malformed so the caller can fall back to a live querySourceFeatures search.
const parseBakedNeighbours = (nb: unknown): BakedNeighbour[] | null => {
  if (typeof nb !== "string" || nb.length === 0) return null;
  try {
    const parsed = JSON.parse(nb);
    return Array.isArray(parsed) ? (parsed as BakedNeighbour[]) : null;
  } catch {
    return null;
  }
};

// The pano source of a panorama style (the oelberg_panorama style has exactly
// one). Supports both a vector-tile source (needs a source-layer) and a
// client-side geojson source (no source-layer). querySourceFeatures /
// feature-state accept an undefined sourceLayer for geojson sources.
const resolvePanoSource = (
  map: { getStyle?: () => unknown } | undefined
): { sourceId: string; sourceLayer?: string } | null => {
  try {
    const style = map?.getStyle?.() as
      | {
          sources?: Record<string, { type?: string }>;
          layers?: Array<{ source?: string; "source-layer"?: string }>;
        }
      | undefined;
    const sources = style?.sources ?? {};
    // Prefer a vector source with its source-layer.
    const vectorId = Object.keys(sources).find(
      (id) => sources[id]?.type === "vector"
    );
    if (vectorId) {
      const sourceLayer = style?.layers?.find(
        (l) => l.source === vectorId && l["source-layer"]
      )?.["source-layer"];
      if (sourceLayer) return { sourceId: vectorId, sourceLayer };
    }
    // Fall back to a geojson source (no source-layer).
    const geojsonId = Object.keys(sources).find(
      (id) => sources[id]?.type === "geojson"
    );
    if (geojsonId) return { sourceId: geojsonId };
    return null;
  } catch {
    return null;
  }
};

interface InfoBoxProps {
  pos?: [number, number];
  onZoomToFeature?: (feature: FeatureInfo) => void;
  displayOrbit?: boolean;
  isOrbiting?: boolean;
  onOrbitToggle?: () => void;
  additionalSecondaryInfoBoxElements?: ReactNode[];
}

const FeatureInfoBox = ({
  pos,
  onZoomToFeature,
  displayOrbit = false,
  isOrbiting = false,
  onOrbitToggle,
  additionalSecondaryInfoBoxElements = [],
}: InfoBoxProps) => {
  const [open, setOpen] = useState(false);
  const [shouldRenderLoadingInfobox, setShouldRenderLoadingInfobox] =
    useState(false);
  const [headerColor, setHeaderColor] = useState<string>("");
  const [parsedHeader, setParsedHeader] = useState<string>("");
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const loadingFeatureInfo = useSelector(getLoading);
  const selectedFeature = useSelector(getSelectedFeature);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const layers = useSelector(getLayers);
  const numOfLayers = layers.length;
  const infoText = useSelector(getInfoText);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  const lightBoxState = useContext(LightBoxContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  if (secondaryInfoBoxElements.length > 4) {
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(
      setSelectedFeature({
        properties: {
          header: "Information",
          headerColor: "#0078a8",
          title: `Es wurden ${secondaryInfoBoxElements.length} Objekte gefunden. Bis zu 4 Objekte können angezeigt werden.`,
          additionalInfo: `Position: ${pos[0].toFixed(5)}, ${pos[1].toFixed(
            5
          )}`,
          subtitle:
            "Hereinzoomen oder Kartenebenen ausblenden, um die Objektanzahl zu reduzieren.",
        },
        id: "information",
      })
    );
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (secondaryInfoBoxElements.length === 0) {
        return;
      }
      if (event.ctrlKey) {
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            const nextFeature = secondaryInfoBoxElements[0];
            dispatch(removeSecondaryInfoBoxElement(nextFeature));
            dispatch(moveFeatureToEnd(selectedFeature));
            dispatch(setSelectedFeature(nextFeature));
            break;
          case "ArrowDown":
            event.preventDefault();
            const prevFeature =
              secondaryInfoBoxElements[secondaryInfoBoxElements.length - 1];
            dispatch(removeSecondaryInfoBoxElement(prevFeature));

            dispatch(moveFeatureToFront(selectedFeature));
            dispatch(setSelectedFeature(prevFeature));
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryInfoBoxElements]);

  let links = [];

  const canZoomToFeature = (selectedFeature) => {
    if (
      selectedFeature.properties?.sourceProps?.bounds ||
      selectedFeature.geometry
    ) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedFeature?.properties?.ffmodal) {
      dispatch(
        addCustomFeatureFlags({
          [selectedFeature.properties.ffmodal]: {
            alias: selectedFeature.properties.ffmodal,
            default: false,
          },
        })
      );
    }
  }, [selectedFeature, dispatch]);

  const shouldDisplaySecondaryInfo = (() => {
    if (!selectedFeature?.properties) return false;

    if (selectedFeature.properties.modal) return true;

    // if ffmodal is used check for the it as a feature flag
    if (selectedFeature.properties.ffmodal) {
      return !!flags[selectedFeature.properties.ffmodal];
    }
    return false;
  })();

  if (selectedFeature && canZoomToFeature(selectedFeature)) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: shouldDisplaySecondaryInfo,
      setVisibleStateOfSecondaryInfo: () => {
        setOpen(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature({
          selectedFeature,
          leafletMap: routedMapRef?.leafletMap?.leafletElement,
          padding: selectionPadding,
        });
        if (onZoomToFeature) {
          onZoomToFeature(selectedFeature as FeatureInfo);
        }
      },
      displayOrbit,
      isOrbiting,
      onOrbitToggle,
    });
  }

  const loadingRef = useRef(loadingFeatureInfo);

  useEffect(() => {
    loadingRef.current = loadingFeatureInfo;

    if (!loadingFeatureInfo) {
      setShouldRenderLoadingInfobox(false);
    } else {
      setTimeout(() => {
        if (loadingRef.current) {
          setShouldRenderLoadingInfobox(true);
        }
      }, 100);
    }
  }, [loadingFeatureInfo]);

  useEffect(() => {
    if (selectedFeature && selectedFeature.properties.sourceProps) {
      console.log(
        "feature properties:",
        selectedFeature.properties.sourceProps
      );
    }

    const updateHeaderAndColor = async () => {
      // Parse header if it exists
      if (selectedFeature?.properties?._header) {
        const header = await utils.parseHeader(
          selectedFeature.properties._header,
          selectedFeature.properties.sourceProps ?? {}
        );
        setParsedHeader(header || "Informationen");
      } else {
        setParsedHeader(selectedFeature?.properties?.header || "Informationen");
      }

      // Parse header color
      if (selectedFeature?.properties?.accentColor) {
        const color = await parseColor(
          selectedFeature.properties.accentColor,
          selectedFeature.properties.sourceProps ?? {}
        );
        setHeaderColor(color || "#0078a8");
      } else {
        setHeaderColor(selectedFeature?.properties?.headerColor || "#0078a8");
      }
    };

    updateHeaderAndColor();
  }, [selectedFeature]);

  useEffect(() => {
    console.log("[PANORAMA] selected feature", {
      selectedFeature,
      panorama: selectedFeature?.properties?.panorama,
      sourceProps: selectedFeature?.properties?.sourceProps,
    });
  }, [selectedFeature]);

  // The maplibre map for the currently selected layer (holds the panorama
  // arrow layers); selectedFeature.id is the layer id.
  const selectedLayerMap = useMemo(
    () => maplibreMaps?.find((entry) => entry.id === selectedFeature?.id)?.map,
    [maplibreMaps, selectedFeature?.id]
  );

  // Latest panorama view yaw (deg), captured from the viewer yaw poll, so the
  // arrow-key navigation can pick the neighbour nearest the current view.
  const panoramaYawRef = useRef<number | null>(null);

  // Rotate the selected arrow to follow the panorama view direction. The value
  // is an expression on the feature's own `heading` (not a precomputed scalar),
  // so the visible arrow stays correct even in the single frame where the
  // selection moves before the snap effect runs (avoids a heading-flip flicker).
  const handlePanoramaYaw = useCallback(
    (yaw: number) => {
      panoramaYawRef.current = yaw;
      if (
        !selectedLayerMap ||
        typeof selectedLayerMap.getLayer !== "function" ||
        !selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
      ) {
        return;
      }
      selectedLayerMap.setLayoutProperty(
        PANORAMA_SELECTION_ARROW_LAYER,
        "icon-rotate",
        ["+", ["get", "heading"], yaw * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET]
      );
    },
    [selectedLayerMap]
  );

  // Restore the data-driven heading and clear the highlight when the selection
  // leaves this layer (the map changes) or the box unmounts; we overrode
  // icon-rotate to a constant and drive feature-state programmatically.
  useEffect(() => {
    if (!selectedLayerMap) return;
    return () => {
      // The map may already be torn down here (e.g. the user removed this
      // layer): getLayer/setLayoutProperty then throw because the map's style
      // is gone. A typeof check doesn't prevent that, so guard the call.
      try {
        if (
          typeof selectedLayerMap.getLayer === "function" &&
          selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
        ) {
          selectedLayerMap.setLayoutProperty(
            PANORAMA_SELECTION_ARROW_LAYER,
            "icon-rotate",
            [
              "+",
              ["get", "heading"],
              PANORAMA_INITIAL_YAW * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
            ]
          );
        }
      } catch {
        // map already removed — nothing to restore
      }
      const src = resolvePanoSource(selectedLayerMap);
      if (src) {
        try {
          selectedLayerMap.removeFeatureState({
            source: src.sourceId,
            sourceLayer: src.sourceLayer,
          });
        } catch {
          // ignore feature-state errors
        }
      }
    };
  }, [selectedLayerMap]);

  // Keep the pano selection highlight in sync with the redux selection. The
  // click path sets feature-state itself, but programmatic tour hops do not, so
  // we make the highlight a pure function of the current selection.
  useEffect(() => {
    if (!selectedLayerMap) return;
    const fid = selectedFeature?.properties?.sourceProps?.fid;
    const src = resolvePanoSource(selectedLayerMap);
    if (
      !src ||
      fid == null ||
      typeof selectedLayerMap.getLayer !== "function" ||
      !selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
    ) {
      return;
    }
    try {
      // The pano feature's id is its `fid` natively: vector tiles bake it in,
      // and the geojson dataset carries it as the GeoJSON feature `id` (so the
      // style must NOT set generateId, which would override it).
      selectedLayerMap.removeFeatureState({
        source: src.sourceId,
        sourceLayer: src.sourceLayer,
      });
      selectedLayerMap.setFeatureState(
        { source: src.sourceId, sourceLayer: src.sourceLayer, id: fid },
        { selected: true }
      );
      // Snap the arrow to the new feature's initial (forward) orientation right
      // away. Data-driven on heading so it is correct the instant the selection
      // moves, before the new viewer's first yaw tick arrives.
      selectedLayerMap.setLayoutProperty(
        PANORAMA_SELECTION_ARROW_LAYER,
        "icon-rotate",
        [
          "+",
          ["get", "heading"],
          PANORAMA_INITIAL_YAW * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
        ]
      );
    } catch {
      // ignore feature-state errors
    }
  }, [selectedFeature, selectedLayerMap]);

  // Jump to a neighbouring panorama (tour hop): build its carma feature from the
  // raw vector feature via the layer's infoBoxMapping, move the map highlight,
  // and select it — the viewer, infobox and arrow all follow.
  const handlePanoramaNavigate = useCallback(
    async (targetFid: number) => {
      if (!selectedLayerMap || !selectedFeature) return;
      const layer = layers.find((l) => l.id === selectedFeature.id);
      const src = resolvePanoSource(selectedLayerMap);
      if (!layer || !src) return;
      let raw;
      try {
        raw = selectedLayerMap.querySourceFeatures(src.sourceId, {
          sourceLayer: src.sourceLayer,
          filter: ["==", "fid", targetFid],
        })?.[0];
      } catch {
        return;
      }
      if (!raw) return;
      const neighborFeature = await createFeature(raw, layer);
      if (!neighborFeature) return;
      // Recenter the (Leaflet) base map on the pano we jump to, so that when the
      // fullscreen viewer is closed the just-visited point sits in the map
      // centre. Navigation hotspots only exist in the fullscreen viewer, so this
      // path only runs for in-viewer tour hops. Keep the current zoom; no
      // animation since the map is hidden behind the lightbox.
      const geom = neighborFeature.geometry;
      const leaflet = routedMapRef?.leafletMap?.leafletElement;
      if (leaflet && geom?.type === "Point" && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates as number[];
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          leaflet.setView([lat, lng], leaflet.getZoom(), { animate: false });
        }
      }
      // The map highlight (selection-arrow feature-state) is kept in sync with
      // the redux selection by the effect below, so just select the neighbour.
      dispatch(setSelectedFeature(neighborFeature));
    },
    [selectedLayerMap, selectedFeature, layers, dispatch, routedMapRef]
  );

  // Build navigation hotspots from the panos surrounding the selected one, and
  // surface the kept neighbours' file names so their images can be preloaded.
  const { hotspots: panoramaHotspots, neighbourFileNames } = useMemo<{
    hotspots: PanoramaHotspot[];
    neighbourFileNames: string[];
  }>(() => {
    const empty = { hotspots: [], neighbourFileNames: [] };
    const props = selectedFeature?.properties?.sourceProps;
    if (
      !selectedLayerMap ||
      !props ||
      typeof selectedLayerMap.querySourceFeatures !== "function"
    ) {
      return empty;
    }
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
        });
      }
    } else {
      const cx = Number(props.proj_x);
      const cy = Number(props.proj_y);
      const cz = Number(props.proj_z);
      if (Number.isNaN(cx) || Number.isNaN(cy)) return empty;
      const src = resolvePanoSource(selectedLayerMap);
      if (!src) return empty;

      let all: Array<{ properties?: Record<string, number> }> = [];
      try {
        all = selectedLayerMap.querySourceFeatures(src.sourceId, {
          sourceLayer: src.sourceLayer,
        });
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
      const src = resolvePanoSource(selectedLayerMap);
      if (src && typeof selectedLayerMap.querySourceFeatures === "function") {
        try {
          const all = selectedLayerMap.querySourceFeatures(src.sourceId, {
            sourceLayer: src.sourceLayer,
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
    }

    const hotspots = kept.map((c) => {
      // Aim the cursor arrow along the neighbour's OWN street (its heading), not
      // the bearing to it — at a junction those differ. Put the heading into the
      // same yaw frame as the cross, then pick the sense (heading or +180) that
      // points toward the neighbour, so the arrow points the way you'd travel.
      let streetYaw = c.yaw;
      if (c.headingDeg != null && Number.isFinite(c.headingDeg)) {
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
        clickHandlerFunc: () => handlePanoramaNavigate(c.fid),
      };
    });

    const neighbourFileNames = kept
      .map((c) => c.fileName)
      .filter((n): n is string => !!n);

    // [PANORAMA] dev: prove which neighbour source is live, how many targets
    // survive declutter, and whether each cross has a distinct street direction
    // (streetYaw != yaw means the neighbour heading reached the arrow). Strip
    // before merge.
    console.log("[PANORAMA] neighbours", {
      source: baked ? "baked-nb" : "fallback-querySourceFeatures",
      found: candidates.length,
      shown: kept.length,
      cHeading: Math.round(cHeading),
      crosses: hotspots.map((h) => ({
        fid: h.id,
        yaw: Math.round(h.yaw),
        streetYaw: Math.round(h.streetYaw),
        headingReached: Math.round(h.streetYaw) !== Math.round(h.yaw),
      })),
    });

    return { hotspots, neighbourFileNames };
  }, [selectedFeature, selectedLayerMap, handlePanoramaNavigate]);

  // Preload the reachable neighbours' panorama images so a tour hop is
  // near-instant (fetch + decode happen while the user looks at the current
  // pano). Each neighbour URL is derived by swapping the current file name in
  // the current panorama URL — the file name appears verbatim once. The Image
  // objects are kept in a ref so their in-flight downloads aren't GC'd.
  const preloadedPanoramasRef = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    const currentUrl = selectedFeature?.properties?.panorama;
    const currentFile = selectedFeature?.properties?.sourceProps?.file_name;
    if (
      typeof currentUrl !== "string" ||
      typeof currentFile !== "string" ||
      !currentFile ||
      neighbourFileNames.length === 0
    ) {
      preloadedPanoramasRef.current = [];
      return;
    }
    const images: HTMLImageElement[] = [];
    for (const fileName of neighbourFileNames) {
      if (fileName === currentFile) continue;
      const url = currentUrl.replace(currentFile, fileName);
      if (url === currentUrl) continue;
      const img = new Image();
      img.src = url;
      img.decode?.().catch(() => {
        // ignore decode failures (e.g. aborted when selection changes)
      });
      images.push(img);
    }
    preloadedPanoramasRef.current = images;
  }, [selectedFeature, neighbourFileNames]);

  // ↑/↓ in the fullscreen viewer: hop to the neighbour nearest the current view
  // direction (↑) or its opposite (↓). The hotspots already carry each
  // neighbour's panorama yaw + its navigate handler, so reuse them.
  const navigatePanoramaTowardView = useCallback(
    (offsetDeg: number) => {
      const viewYaw = panoramaYawRef.current ?? PANORAMA_INITIAL_YAW;
      const targetYaw = viewYaw + offsetDeg;
      let best: PanoramaHotspot | null = null;
      let bestDiff = Infinity;
      for (const hotspot of panoramaHotspots) {
        const diff = angularDiffDeg(hotspot.yaw, targetYaw);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = hotspot;
        }
      }
      if (best && bestDiff <= PANORAMA_NAV_HEMISPHERE_DEG) {
        best.clickHandlerFunc?.();
      }
    },
    [panoramaHotspots]
  );
  const handlePanoramaNext = useCallback(
    () => navigatePanoramaTowardView(0),
    [navigatePanoramaTowardView]
  );
  const handlePanoramaPrevious = useCallback(
    () => navigatePanoramaTowardView(180),
    [navigatePanoramaTowardView]
  );

  // The panorama as a custom lightbox slide: it hosts the embeddable
  // PanoramaViewer (the media lightbox supplies the surrounding chrome). Only
  // the active slide is rendered, so the viewer mounts once and tears down when
  // the user pages to a photo.
  const panoramaSlide = useMemo<LightBoxCustomSlide | null>(() => {
    const props = selectedFeature?.properties;
    if (!props?.panorama) {
      return null;
    }
    const src = props.panorama as string;
    const multiResConfigUrl = props.panoramaMultiResConfig as string | undefined;
    return {
      type: "custom",
      key: "panorama",
      render: ({ active }) =>
        active ? (
          <PanoramaViewer
            src={src}
            multiResConfigUrl={multiResConfigUrl}
            onYawChange={handlePanoramaYaw}
            onNext={handlePanoramaNext}
            onPrevious={handlePanoramaPrevious}
            hotspots={panoramaHotspots}
            initialYaw={PANORAMA_INITIAL_YAW}
          />
        ) : null,
    };
  }, [
    selectedFeature,
    handlePanoramaYaw,
    handlePanoramaNext,
    handlePanoramaPrevious,
    panoramaHotspots,
  ]);

  // Simple photo images (single `foto` or a `fotos` array) as image slides, so
  // they sit alongside the panorama in one lightbox. The harvested-fotostrecke
  // path stays on the legacy react-image-lightbox flow (used when there is no
  // panorama).
  const photoSlides = useMemo<LightBoxImageSlide[]>(() => {
    const props = selectedFeature?.properties;
    if (!props) {
      return [];
    }
    const urls: string[] = [];
    if (Array.isArray(props.fotos)) {
      urls.push(...props.fotos);
    } else if (props.foto) {
      urls.push(props.foto);
    }
    return urls
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .map((u) => ({ type: "image", src: updateUrl(u) }));
  }, [selectedFeature]);

  const mediaSlides = useMemo<LightBoxSlide[]>(
    () => (panoramaSlide ? [panoramaSlide, ...photoSlides] : photoSlides),
    [panoramaSlide, photoSlides]
  );

  // While the unified (panorama) lightbox is open, keep its slides current: a
  // tour hop swaps selectedFeature, so src/hotspots/handlers change and the
  // embedded viewer must follow. Guarded to the custom-slide case so the
  // photo-only react-image-lightbox path keeps managing its own slides.
  const lightboxVisible = !!lightBoxState?.visible;
  const lightboxHasCustomSlides = !!lightBoxState?.slides?.some(
    (slide) => slide.type === "custom"
  );
  useEffect(() => {
    if (lightboxVisible && lightboxHasCustomSlides) {
      lightBoxDispatchContext?.setSlides(mediaSlides);
    }
  }, [
    mediaSlides,
    lightboxVisible,
    lightboxHasCustomSlides,
    lightBoxDispatchContext,
  ]);

  const openPanoramaLightBox = useCallback(() => {
    lightBoxDispatchContext?.setAll({
      // No title — matches the standalone photo lightbox, which shows none here.
      title: "",
      photourls: [],
      // Same Stadt-Wuppertal attribution the photo lightbox shows, so the two
      // viewers read identically. Slides may override per-slide if needed.
      caption: defaultLightBoxCaptionFactory(),
      index: 0, // the panorama is always the first slide
      visible: true,
      slides: mediaSlides,
    });
  }, [lightBoxDispatchContext, selectedFeature, mediaSlides]);

  if (loadingFeatureInfo && shouldRenderLoadingInfobox)
    return <LoadingInfoBox />;

  if (!selectedFeature) {
    return null;
  }

  const featureHeaders = secondaryInfoBoxElements.map((feature, i) => {
    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
        }}
        key={"overlapping."}
        onClick={() => {
          dispatch(setSelectedFeature(feature));
          dispatch(updateSecondaryInfoBoxElements(feature));
          dispatch(setPreferredLayerId(feature.id));
          if (feature.vectorId) {
            dispatch(setPreferredVectorLayerId(feature.vectorId));
          } else {
            dispatch(setPreferredVectorLayerId(undefined));
          }
        }}
      >
        <InfoBoxHeader
          content={
            feature.properties.header ||
            feature.properties._header ||
            "Informationen"
          }
          headerColor={"grey"}
          properties={feature.properties.sourceProps}
        ></InfoBoxHeader>
      </div>
    );
  });

  const Modal = additionalInfoFactory(
    selectedFeature?.properties?.ffmodal ?? selectedFeature?.properties?.modal
  );

  if (!headerColor) {
    return <></>;
  }

  const panoramaElements = selectedFeature.properties.panorama
    ? [
        <PanoramaPreview
          key="infobox-panorama-preview"
          src={selectedFeature.properties.panorama}
          multiResConfigUrl={selectedFeature.properties.panoramaMultiResConfig}
          onExpand={openPanoramaLightBox}
          // Only the active viewer drives the map arrow; yield to the
          // lightbox viewer while it is open.
          onYawChange={lightboxVisible ? undefined : handlePanoramaYaw}
          initialYaw={PANORAMA_INITIAL_YAW}
        />,
      ]
    : [];

  const visibleSecondaryInfoBoxElements =
    selectedFeature.properties.foto || selectedFeature.properties.fotos
      ? [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
          <InfoBoxFotoPreview
            currentFeature={selectedFeature}
            lightBoxDispatchContext={lightBoxDispatchContext}
            urlManipulation={updateUrl}
          />,
        ]
      : [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
        ];

  return (
    <>
      <InfoBox
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={true}
        {...selectedFeature?.properties}
        headerColor={headerColor}
        title={
          selectedFeature?.properties?.title?.includes("undefined")
            ? undefined
            : selectedFeature?.properties?.title
        }
        noCurrentFeatureTitle={
          infoText
            ? infoText
            : numOfLayers > 0
            ? "Auf die Karte klicken um Informationen abzurufen"
            : "Layer hinzufügen um Informationen abrufen zu können"
        }
        header={
          parsedHeader && isHtmlString(parsedHeader) ? (
            parsedHeader
          ) : (
            <div
              className="w-full"
              style={{
                backgroundColor: headerColor,
              }}
            >
              {parsedHeader
                ? truncateString(parsedHeader, 66)
                : "Informationen"}
            </div>
          )
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={visibleSecondaryInfoBoxElements}
        links={links}
      />
      {open && Modal && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={
            selectedFeature.properties.sourceProps?.properties ||
            selectedFeature.properties.sourceProps?.targetProperties
              ? selectedFeature.properties.sourceProps
              : { properties: selectedFeature.properties.sourceProps }
          }
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory({
            skipTeilzwilling: true,
            isTopicMap: false,
          })}
          skipTeilzwilling={true}
        />
      )}
    </>
  );
};

export default FeatureInfoBox;
