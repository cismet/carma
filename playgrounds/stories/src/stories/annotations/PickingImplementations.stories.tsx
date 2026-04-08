import type { CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";

// ---------------------------------------------------------------------------
// Inventory of parallel mouse-to-point picking implementations
// Last updated: 2026-04-08
// ---------------------------------------------------------------------------

type PickingImpl = {
  id: number;
  name: string;
  file: string;
  cesiumApi: string;
  strategy: string;
  usedBy: string;
  status: "active" | "legacy";
  notes?: string;
};

const PICKING_IMPLEMENTATIONS: PickingImpl[] = [
  {
    id: 1,
    name: "resolvePreferredPointQueryPick",
    file: "libraries/mapping/engines/cesium/react/interactions/src/lib/hooks/pointQueryPicking.ts",
    cesiumApi: "tileset.pick(ray, frameState) → scene.globe.pick(ray, scene)",
    strategy:
      "Tileset-first with globe fallback. Per-frame cache by screen position. Authoritative annotation pick path.",
    usedBy: "useCesiumPointQuery → all annotation tools (runtime-v2 & v1)",
    status: "active",
    notes:
      "The primary pick authority. Requires a point-query tileset to be registered via registerCesiumScenePointQueryTileset().",
  },
  {
    id: 2,
    name: "pickBestAvailablePositionAtScreenPosition",
    file: "libraries/mapping/engines/cesium/core/src/lib/carma-helpers/scene/Picking.ts",
    cesiumApi: "scene.pickPosition(windowPos) → scene.globe.pick(ray, scene)",
    strategy:
      "scene.pickPosition-first (depth buffer) with globe fallback. Simpler helper, no tileset registration required.",
    usedBy: "Ad-hoc scene helpers, coordinate adapters",
    status: "active",
    notes:
      "Parallel to resolvePreferredPointQueryPick but uses the scene depth buffer as the primary source instead of a registered tileset.",
  },
  {
    id: 3,
    name: "Tangent-plane reprojection (fast path)",
    file: "libraries/mapping/annotations/runtime-v2/src/lib/interaction/createPointQueryPreviewController.ts",
    cesiumApi: "Custom ray-plane math (no Cesium pick call)",
    strategy:
      "Projects the current mouse ray onto the last known tangent plane for zero-latency cursor-follow. Corrected by background true picks at ~60 Hz.",
    usedBy: "Preview ring disc in annotation creation UX",
    status: "active",
    notes:
      "Not a real pick — deliberately avoids Cesium API for latency. Depends on implementations 1 for ground truth refreshes.",
  },
  {
    id: 4,
    name: "samplePreferredPointQuerySurfaceNormal",
    file: "libraries/mapping/engines/cesium/react/interactions/src/lib/hooks/pointQueryPicking.ts",
    cesiumApi: "5× resolvePreferredPointQueryPick calls at ±2 px offsets",
    strategy:
      "Cross-samples 4 neighbours around the hit point and computes tangent × normal. Epsilon guards + previous-normal retention.",
    usedBy: "useCesiumPointQuery (surface normal output)",
    status: "active",
    notes: "Duplicated algorithm — see also sampleSurfaceNormalAtScreenPosition in Picking.ts (#5).",
  },
  {
    id: 5,
    name: "sampleSurfaceNormalAtScreenPosition",
    file: "libraries/mapping/engines/cesium/core/src/lib/carma-helpers/scene/Picking.ts",
    cesiumApi: "5× pickBestAvailablePositionAtScreenPosition calls at ±2 px offsets",
    strategy: "Same ±2 px cross-sampling algorithm as #4 but built on scene.pickPosition.",
    usedBy: "Core scene helpers (standalone, not wired into annotation tools)",
    status: "active",
    notes: "Algorithmically identical to #4 — candidate for consolidation.",
  },
  {
    id: 6,
    name: "scene.drillPick (ByTilesetClassifier)",
    file: "libraries/mapping/engines/cesium/legacy/src/lib/components/ByTilesetClassifier/hooks.ts",
    cesiumApi: "scene.drillPick(pos, limit) + scene.pickPosition(pos)",
    strategy: "Hierarchical multi-object drill up to drillPickLimit (default 5). Returns feature + properties.",
    usedBy: "ByTilesetClassifier (click handler for 3D tileset features)",
    status: "legacy",
    notes: "Also used in pick-ground-primitive.ts for GeoJSON clamped ground primitives.",
  },
  {
    id: 7,
    name: "camera.pickEllipsoid (Compass)",
    file: "libraries/mapping/engines/cesium/legacy/src/lib/components/controls/Compass.tsx",
    cesiumApi: "camera.pickEllipsoid(windowPos)",
    strategy: "Pure ellipsoid intersection, ignores terrain and buildings. Used only for horizon-visible test.",
    usedBy: "Legacy Compass control",
    status: "legacy",
    notes:
      "Migrate to @carma-mapping/engines-interop/navigation-controls which does not use direct picking.",
  },
];

// ---------------------------------------------------------------------------
// Surface-normal smoothing (adjacent concern, not a pick impl itself)
// ---------------------------------------------------------------------------

type SmoothingImpl = {
  name: string;
  file: string;
  algorithm: string;
  usedBy: string;
};

const SMOOTHING_IMPLEMENTATIONS: SmoothingImpl[] = [
  {
    name: "candidateRingNormalSmoothing (trail average)",
    file: "libraries/mapping/annotations/core/src/lib/utils/candidateRingNormalSmoothing.ts",
    algorithm: "Exponential gamma-decay weighted average over a configurable trail (~90 samples default)",
    usedBy: "createPointQueryPreviewController — smooths the disc orientation over time",
  },
  {
    name: "Per-frame ±2px cross-sample (#4 / #5 above)",
    file: "pointQueryPicking.ts + Picking.ts",
    algorithm: "Instantaneous tangent × normal from 4 neighbours, no temporal smoothing",
    usedBy: "useCesiumPointQuery (raw normal output per hover sample)",
  },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PAGE: CSSProperties = {
  fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
  color: "#0f172a",
  background: "#f8fafc",
  minHeight: "100vh",
  padding: "24px 20px",
  boxSizing: "border-box",
};

const H1: CSSProperties = {
  font: '700 18px/1.3 "IBM Plex Sans", sans-serif',
  margin: "0 0 4px",
};

const H2: CSSProperties = {
  font: '600 13px/1.3 "IBM Plex Mono", monospace',
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "#475569",
  margin: "24px 0 8px",
};

const SUBTITLE: CSSProperties = {
  color: "#64748b",
  margin: "0 0 24px",
  maxWidth: 680,
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const TH: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  background: "#e2e8f0",
  font: '600 11px/1.2 "IBM Plex Mono", monospace',
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  borderBottom: "2px solid #cbd5e1",
  whiteSpace: "nowrap",
};

const TD: CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

const MONO: CSSProperties = {
  fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
  fontSize: 11,
  color: "#1e40af",
  wordBreak: "break-all",
};

const FILE_STYLE: CSSProperties = {
  fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
  fontSize: 10,
  color: "#64748b",
  wordBreak: "break-all",
};

const BADGE_ACTIVE: CSSProperties = {
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 10,
  background: "#dcfce7",
  color: "#166534",
  font: '600 10px/1.5 "IBM Plex Sans", sans-serif',
  letterSpacing: "0.04em",
};

const BADGE_LEGACY: CSSProperties = {
  ...BADGE_ACTIVE,
  background: "#fef3c7",
  color: "#92400e",
};

const NOTE: CSSProperties = {
  color: "#64748b",
  fontStyle: "italic",
  fontSize: 11,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PickingInventory() {
  const active = PICKING_IMPLEMENTATIONS.filter((p) => p.status === "active");
  const legacy = PICKING_IMPLEMENTATIONS.filter((p) => p.status === "legacy");

  const renderRows = (impls: PickingImpl[]) =>
    impls.map((p) => (
      <tr key={p.id} style={{ background: p.id % 2 === 0 ? "#f1f5f9" : "white" }}>
        <td style={TD}>
          <span style={MONO}>{p.name}</span>
        </td>
        <td style={TD}>
          <span style={FILE_STYLE}>{p.file}</span>
        </td>
        <td style={TD}>
          <span style={MONO}>{p.cesiumApi}</span>
        </td>
        <td style={{ ...TD, maxWidth: 260 }}>{p.strategy}</td>
        <td style={TD}>{p.usedBy}</td>
        <td style={TD}>
          <span style={p.status === "active" ? BADGE_ACTIVE : BADGE_LEGACY}>
            {p.status}
          </span>
        </td>
        <td style={{ ...TD, maxWidth: 220 }}>
          {p.notes && <span style={NOTE}>{p.notes}</span>}
        </td>
      </tr>
    ));

  return (
    <div style={PAGE}>
      <h1 style={H1}>Mouse → Point Picking — Implementation Inventory</h1>
      <p style={SUBTITLE}>
        {active.length} active + {legacy.length} legacy = {PICKING_IMPLEMENTATIONS.length} total picking
        implementations. Active items #4 and #5 (surface normal sampling) use the same algorithm on
        different underlying pickers — candidate for consolidation.
      </p>

      <h2 style={H2}>Picking implementations</h2>
      <table style={TABLE}>
        <thead>
          <tr>
            {["Name", "File", "Cesium API", "Strategy", "Used By", "Status", "Notes"].map((h) => (
              <th key={h} style={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{renderRows(active)}{renderRows(legacy)}</tbody>
      </table>

      <h2 style={H2}>Surface-normal smoothing (adjacent concern)</h2>
      <table style={TABLE}>
        <thead>
          <tr>
            {["Name", "File", "Algorithm", "Used By"].map((h) => (
              <th key={h} style={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SMOOTHING_IMPLEMENTATIONS.map((s, i) => (
            <tr key={s.name} style={{ background: i % 2 === 0 ? "white" : "#f1f5f9" }}>
              <td style={TD}>
                <span style={MONO}>{s.name}</span>
              </td>
              <td style={TD}>
                <span style={FILE_STYLE}>{s.file}</span>
              </td>
              <td style={TD}>{s.algorithm}</td>
              <td style={TD}>{s.usedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={H2}>Pick-strategy hierarchy (active stack)</h2>
      <pre
        style={{
          background: "#1e293b",
          color: "#e2e8f0",
          padding: "16px 20px",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.7,
          fontFamily: '"IBM Plex Mono", monospace',
          overflowX: "auto",
        }}
      >
        {`Annotation tool click / hover
  └─ useCesiumPointQuery (@ preRender)
       └─ resolvePreferredPointQueryPick()          [#1]
            ├─ tileset.pick(ray, frameState)         ← registered point-query tileset (high-LOD)
            └─ scene.globe.pick(ray, scene)          ← terrain fallback
       └─ samplePreferredPointQuerySurfaceNormal()   [#4]
            └─ 5× resolvePreferredPointQueryPick at ±2 px

Preview ring disc (cursor-follow)
  └─ createPointQueryPreviewController
       ├─ FAST:  ray ∩ last-tangent-plane           [#3]  (zero-lat, no Cesium call)
       └─ SLOW:  resolvePreferredPointQueryPick()   [#1]  (~60 Hz correction)

Core scene helpers (ad-hoc, not annotation tools)
  └─ pickBestAvailablePositionAtScreenPosition()    [#2]
       ├─ scene.pickPosition()
       └─ scene.globe.pick()
  └─ sampleSurfaceNormalAtScreenPosition()          [#5]  ← duplicate algorithm of #4`}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

const meta: Meta = {
  title: "Annotations/Picking Implementations",
  component: PickingInventory,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Inventory: Story = {};
