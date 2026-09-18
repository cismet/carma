import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createMapViewSyncGroup } from "@carma-mapping/engines/maplibre";
import { getGcg2016Undulations } from "@carma-geo/proj";
import type { LngLatArray } from "@carma-geo/data-structures";
import { MapLibreThreeReferenceSurfacesDemo } from "./MapLibreThreeReferenceSurfacesDemo";
import { REFERENCE_SURFACE_DEFAULTS } from "./reference-surface-defaults";
import { MESH_MOUNT_PRESETS, MESH_MOUNT_VIEW } from "./mesh-mount-presets";
import {
  ELEVATION_COLOR_DATUM,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  type ElevationColorDatum,
  type TerrainHeightDatum,
  REFERENCE_PHYSICAL_CAMERA_POSES,
  REFERENCE_CAMERA_PRESET,
  createReferenceFrame,
  referenceMountDrop,
} from "./maplibre-three-reference-surfaces";

const SITES = {
  barmen: {
    label: "Rathaus Barmen",
    lngLat: [7.1999207, 51.2725716] as const,
    mesh: true,
  },
  origin: {
    label: "Mesh mount origin",
    lngLat: MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT].lngLat,
    mesh: true,
  },
  north: {
    label: "Paul-Flocke-Weg · north comparison",
    lngLat: MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.NORTH].lngLat,
    mesh: true,
  },
  south: {
    label: "Cronenberg · south comparison",
    lngLat: MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.SOUTH].lngLat,
    mesh: true,
  },
  stoffelsberg: {
    label: "Stoffelsberg · east comparison",
    lngLat: MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.FAR].lngLat,
    mesh: true,
  },
  nordhelle: {
    label: "Nordhelle · covered terrain edge (~40 km)",
    lngLat:
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
      ].targetLngLat,
    mesh: false,
  },
} as const;

const ANCHOR = SITES.origin.lngLat;
const ANCHOR_FRAME = createReferenceFrame(ANCHOR, 6371000);
const signedMeters = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(3)} m`;
const METRIC_LABELS = {
  [ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE]: "Δh − ΔH = ζ(P) − ζ(anchor)",
  [ELEVATION_COLOR_DATUM.MOUNT_DROP]:
    "Naive ECEF mount: local Up − recovered height",
  [ELEVATION_COLOR_DATUM.RELATIVE_DHHN2016]: "ΔH: DHHN2016 relative to anchor",
  [ELEVATION_COLOR_DATUM.RELATIVE_ELLIPSOIDAL]:
    "Δh: ellipsoidal height relative to anchor",
  [ELEVATION_COLOR_DATUM.SCENE]: "Absolute scene-plane Up",
  [ELEVATION_COLOR_DATUM.DHHN2016]: "Absolute DHHN2016 H",
  [ELEVATION_COLOR_DATUM.ELLIPSOIDAL]: "Absolute ellipsoidal h",
  [ELEVATION_COLOR_DATUM.UNDULATION]: "Absolute ζ = h − H",
};

type Options = {
  datum: ElevationColorDatum;
  datumReference: "anchor-relative" | "absolute";
  anchorNormalHeightMeters: number;
  meshEncodedHeightDatum: TerrainHeightDatum;
  presentation: "single" | "side-by-side" | "overlay";
  surface: "planar" | "corrected" | "mesh";
  overlayOpacity: number;
  showMesh: boolean;
  site: keyof typeof SITES;
  correctDatum: boolean;
  correctCurvature: boolean;
  zoom: number;
  pitch: number;
};
const ElevationStripes = (args: Options) => {
  const colorDatum =
    args.datum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE &&
    args.datumReference === "absolute"
      ? ELEVATION_COLOR_DATUM.UNDULATION
      : args.datum;
  const autoMetricRange =
    colorDatum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE ||
    colorDatum === ELEVATION_COLOR_DATUM.UNDULATION ||
    colorDatum === ELEVATION_COLOR_DATUM.MOUNT_DROP;
  const [probe, setProbe] = useState<readonly [number, number]>(
    SITES[args.site].lngLat
  );
  const [reference, setReference] = useState<{
    anchor: number;
    delta: number;
    sites: number[];
  } | null>(null);
  useEffect(() => setProbe(SITES[args.site].lngLat), [args.site]);
  useEffect(() => {
    let cancelled = false;
    setReference(null);
    const coordinates = [
      ANCHOR,
      probe,
      ...Object.values(SITES).map((site) => site.lngLat),
    ];
    void getGcg2016Undulations(
      coordinates.map((p) => [...p] as LngLatArray.deg)
    )
      .then((values) => {
        if (!cancelled)
          setReference({
            anchor: values[0],
            delta: values[1] - values[0],
            sites: values.slice(2).map((value) => value - values[0]),
          });
      })
      .catch(() => {
        /* Keep unavailable explicit; never substitute a datum. */
      });
    return () => {
      cancelled = true;
    };
  }, [probe]);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const syncRef = useRef<ReturnType<typeof createMapViewSyncGroup> | null>(
    null
  );
  const onMapReady = useCallback((map: MapLibreMap) => {
    syncRef.current ??= createMapViewSyncGroup();
    const remove = syncRef.current.add(map);
    const update = () => {
      const { lng, lat } = map.getCenter();
      setProbe((previous) =>
        Math.abs(previous[0] - lng) + Math.abs(previous[1] - lat) < 1e-8
          ? previous
          : [lng, lat]
      );
    };
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
      remove();
    };
  }, []);
  useEffect(
    () => () => {
      syncRef.current?.dispose();
      syncRef.current = null;
    },
    []
  );
  const site = SITES[args.site];
  const single = args.presentation === "single";
  const surface =
    args.surface === "mesh" && !site.mesh ? "corrected" : args.surface;
  const panels = single
    ? [surface]
    : args.showMesh && site.mesh
    ? ["corrected", "mesh"]
    : ["planar", "corrected"];
  const overlay = args.presentation === "overlay";
  const colorRange =
    args.datum === ELEVATION_COLOR_DATUM.MOUNT_DROP
      ? [-12, 0]
      : args.datum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE
      ? [-0.5, 0.5]
      : args.datum === ELEVATION_COLOR_DATUM.RELATIVE_DHHN2016 ||
        args.datum === ELEVATION_COLOR_DATUM.RELATIVE_ELLIPSOIDAL
      ? [-100, 100]
      : [0, 500];
  return (
    <section
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        font: "12px system-ui",
      }}
    >
      <header style={{ padding: "6px 10px" }}>
        <strong>
          {METRIC_LABELS[colorDatum]} · {site.label}
        </strong>
        <br />
        Fixed mesh-root anchor{" "}
        {ANCHOR.map((value) => value.toFixed(6)).join(", ")} · H₀ ={" "}
        {args.anchorNormalHeightMeters.toFixed(2)} m (assumed, adjustable).
        <br />
        Centre reference: Δζ{" "}
        {reference ? signedMeters(reference.delta) : "loading / unavailable"} ·
        WGS84 tangent drop{" "}
        {signedMeters(referenceMountDrop(ANCHOR_FRAME, ...probe))}.
        {autoMetricRange
          ? " Colours: viewport min…max · 10 cm thin / 1 m bold contours."
          : " 1 m contours · repeating 100 m colour cycle."}
        <br />
        <details>
          <summary>Anchor, numerical predictions and comparison notes</summary>
          Both relative heights use the same anchor: h₀ = H₀ + ζ₀. Δh − ΔH
          cancels both relief and the constant datum offset; only Δζ remains.
          Absolute ζ and anchor-relative Δζ share one mode: only a constant
          offset changes. Both the GPU field and readouts use
          getGcg2016Undulations from @carma-geo/proj, backed by the shared
          GCG2016 resource grid and BKG-compatible interpolation. Colour limits
          are sampled over the viewport ground footprint after movement; they
          are not guaranteed extrema of the loaded surface triangles. The drop
          mode isolates geometric sag, not the actual terrain slope. Shader sag
          uses local quadratic curvature; table uses double-precision WGS84 at h
          = 0. Residual colours include subtle relief shading; use the numeric
          readout for exact values. These are model predictions, not measured
          mesh offsets or a certification of its height datum.
          <table>
            <thead>
              <tr>
                <th>Reference point</th>
                <th>Δζ</th>
                <th>WGS84 drop</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(SITES).map((entry, index) => (
                <tr key={entry.label}>
                  <td>{entry.label}</td>
                  <td>
                    {reference ? signedMeters(reference.sites[index]) : "—"}
                  </td>
                  <td>
                    {signedMeters(
                      referenceMountDrop(ANCHOR_FRAME, ...entry.lngLat)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reference && <>ζ₀ = {reference.anchor.toFixed(3)} m. </>}
          One surface by default; at most two scenes, bounded tile budgets;
          hidden tabs release scenes. Same DOM1 raster in A/B; colour datum is
          independent of bending.
          <br />
          {site.label} · H→h correction {args.correctDatum ? "on" : "off"} ·
          curvature {args.correctCurvature ? "on" : "off"}. N = h − H uses
          bundled GCG2016 on the selected geometry; enable both corrections to
          show it at ellipsoidal placement.
          {!site.mesh &&
            " Mesh omitted: this far terrain site lies outside the mesh extent; terrain coverage is clipped nearby."}
          <br />
          C: encoded mesh-height hypothesis: {args.meshEncodedHeightDatum}. At
          7.2015° E / 51.2705° N, mesh 154.370 m matches DSM 154.381 m; treating
          it as h and subtracting GCG produces a 46.55 m mismatch. This
          observation does not certify the source datum. Colour interpretation
          only, no mesh displacement.
          <br />
          Drag/zoom/tilt any map: cameras stay synchronized. Different geometric
          projections need not align in screen space; corresponding DSM vertices
          must keep their H/h colours. Scene-plane colours intentionally change.
        </details>
      </header>
      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: overlay
            ? "1fr"
            : `repeat(${panels.length}, minmax(0,1fr))`,
        }}
      >
        {!visible && <p>Comparison suspended while this tab is hidden.</p>}
        {visible &&
          panels.map((panel, index) => (
            <div
              key={panel}
              style={{
                minWidth: 0,
                minHeight: 0,
                ...(overlay
                  ? {
                      gridArea: "1 / 1",
                      opacity: index ? args.overlayOpacity : 1,
                      pointerEvents:
                        index === panels.length - 1
                          ? ("auto" as const)
                          : ("none" as const),
                    }
                  : {}),
              }}
            >
              <MapLibreThreeReferenceSurfacesDemo
                {...REFERENCE_SURFACE_DEFAULTS}
                embedded
                panelLabel={
                  panel === "planar"
                    ? "Planar DSM"
                    : panel === "mesh"
                    ? "ECEF mesh"
                    : "Corrected DSM"
                }
                boundedComparison
                elevationAnchor={ANCHOR}
                elevationAnchorNormalHeightMeters={
                  args.anchorNormalHeightMeters
                }
                showDiagnostics={false}
                onMapReady={onMapReady}
                longitude={site.lngLat[0]}
                latitude={site.lngLat[1]}
                zoom={Math.max(12, Math.min(20, args.zoom))}
                pitch={Math.max(0, Math.min(60, args.pitch))}
                showTerrain={panel !== "mesh"}
                showMesh2024={panel === "mesh"}
                terrainModel="dom1"
                terrainAppearance="viridis"
                meshAppearance="elevation"
                terrainGeometryMode={
                  panel === "planar" || !args.correctCurvature
                    ? TERRAIN_GEOMETRY_MODE.MERCATOR
                    : TERRAIN_GEOMETRY_MODE.WGS84_ECEF
                }
                terrainHeightDatum={
                  args.correctDatum
                    ? TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
                    : TERRAIN_HEIGHT_DATUM.DHHN2016
                }
                elevationColorDatum={colorDatum}
                autoMetricRange={autoMetricRange}
                meshEncodedHeightDatum={args.meshEncodedHeightDatum}
                elevationIsolines
                autoElevationRange={false}
                terrainElevationMinimumMeters={colorRange[0]}
                terrainElevationMaximumMeters={colorRange[1]}
                terrainErrorTargetPixels={4}
                meshErrorTargetPixels={4}
              />
            </div>
          ))}
      </main>
    </section>
  );
};
const meta = {
  title: "Terrain and Atmosphere/Projections/Elevation Stripes",
  id: "terrain-and-atmosphere-elevation-stripes",
  component: ElevationStripes,
  parameters: { layout: "fullscreen" },
  args: {
    datum: ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE,
    datumReference: "anchor-relative",
    anchorNormalHeightMeters: 207.6,
    meshEncodedHeightDatum: TERRAIN_HEIGHT_DATUM.DHHN2016,
    presentation: "single",
    surface: "corrected",
    overlayOpacity: 0.5,
    showMesh: false,
    site: "barmen",
    correctDatum: true,
    correctCurvature: true,
    zoom: 16,
    pitch: 45,
  },
  argTypes: {
    anchorNormalHeightMeters: {
      control: "number",
      description:
        "Diagnostic H at the fixed root anchor, not a surveyed ground height. Cancels from Δζ and mount-drop modes.",
      table: { category: "Elevation" },
    },
    site: {
      control: {
        type: "select",
        labels: Object.fromEntries(
          Object.entries(SITES).map(([id, site]) => [id, site.label])
        ),
      },
      options: Object.keys(SITES),
      table: { category: "View" },
    },
    correctDatum: {
      control: "boolean",
      table: { category: "Corrections" },
      description: "Geometry only: add GCG2016 N to the raster's DHHN2016 H.",
    },
    correctCurvature: {
      control: "boolean",
      table: { category: "Corrections" },
      description: "Second DSM: ECEF curvature on/off. First stays planar.",
    },
    meshEncodedHeightDatum: {
      control: "radio",
      options: Object.values(TERRAIN_HEIGHT_DATUM),
      table: { category: "Elevation" },
      description:
        "Explicit diagnostic hypothesis, not a certified dataset datum. Does not displace geometry.",
    },
    datum: {
      control: {
        type: "radio",
        labels: {
          ...METRIC_LABELS,
          [ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE]: "Datum separation ζ / Δζ",
        },
      },
      options: Object.values(ELEVATION_COLOR_DATUM).filter(
        (datum) => datum !== ELEVATION_COLOR_DATUM.UNDULATION
      ),
      table: { category: "Elevation" },
    },
    datumReference: {
      control: {
        type: "inline-radio",
        labels: {
          "anchor-relative": "Relative to anchor Δζ",
          absolute: "Absolute ζ",
        },
      },
      options: ["anchor-relative", "absolute"],
      if: { arg: "datum", eq: ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE },
      table: { category: "Elevation" },
    },
    presentation: {
      control: "radio",
      options: ["single", "side-by-side", "overlay"],
      table: { category: "Comparison" },
    },
    surface: {
      control: "radio",
      options: ["planar", "corrected", "mesh"],
      if: { arg: "presentation", eq: "single" },
      table: { category: "Comparison" },
    },
    overlayOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      table: { category: "Comparison" },
    },
    showMesh: { table: { category: "Comparison" } },
    zoom: {
      control: { type: "range", min: 12, max: 20, step: 0.25 },
      table: { category: "View" },
    },
    pitch: {
      control: { type: "range", min: 0, max: 60, step: 1 },
      table: { category: "View" },
    },
  },
} satisfies Meta<typeof ElevationStripes>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
