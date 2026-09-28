import type { StripChartRow } from "@carma-commons/ui/components";

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const row = (
  id: string,
  label: string,
  color: string,
  unit?: string,
  plot = label,
  description?: string,
  reference?: StripChartRow["reference"]
): StripChartRow => ({
  id,
  label,
  color,
  unit,
  plot,
  description,
  reference,
  min: 0,
  format: (value) => (Number.isFinite(value) ? number.format(value) : "–"),
});

// Same-unit series share a scale only when they describe the same resource.
// Decoded payload is CPU input, not network bandwidth. Never stack these rates.
export const TILE_PIPELINE_CHART_ROWS: readonly StripChartRow[] = [
  {
    section: "Network",
    rows: [
      row(
        "downloadMiBs",
        "Wire",
        "#2563eb",
        "MiB/s",
        "Transfer throughput",
        "Completed responses attributed to this runtime, not instantaneous link usage. Completion bursts can exceed the reference; timing may be unavailable.",
        { label: "600 Mbit/s assumed", value: 600_000_000 / 8 / 1024 ** 2 }
      ),
      row(
        "fileMiBs",
        "Encoded bodies",
        "#c2410c",
        "MiB/s",
        "Transfer throughput",
        "Completed encoded bodies, including cache hits; Content-Length fallback when timing is hidden. Not additional wire traffic."
      ),
      row("downloading", "Active", "#2563eb", undefined, "Requests"),
      row("queued", "Queued", "#c2410c", undefined, "Requests"),
      row(
        "downloadActivePerOrigin",
        "Busiest origin",
        "#64748b",
        undefined,
        "Connection budget",
        "Active payload jobs on the busiest origin versus its configured admission cap, not physical connections.",
        { label: "Slots / origin", metric: "downloadSlotsPerOrigin" }
      ),
      row(
        "downloadsPerS",
        "Mesh responses",
        "#2563eb",
        "/s",
        "Completed responses"
      ),
      row(
        "metadataReadyPerS",
        "Metadata ready",
        "#0f766e",
        "/s",
        "Completed responses",
        "Includes worker and cache readiness, not only network responses."
      ),
      row("queueAgeMs", "Queued", "#c2410c", "ms", "Oldest request age"),
      row("requestAgeMs", "Active", "#2563eb", "ms", "Oldest request age"),
      row(
        "headersMs",
        "Fetch → headers",
        "#2563eb",
        "ms",
        "Response latency · mean",
        "Observed fetch duration until headers are available."
      ),
      row(
        "ttfbMs",
        "First byte",
        "#0f766e",
        "ms",
        "Response latency · mean",
        "Resource Timing request-to-first-byte duration; unavailable without timing access."
      ),
      row(
        "bodyMs",
        "Body",
        "#0f766e",
        "ms",
        "Download duration · mean",
        "Resource Timing body duration when available; otherwise observed headers to body-ready time, including decompression and browser body reading."
      ),
      row(
        "downloadMs",
        "Whole request",
        "#2563eb",
        "ms",
        "Download duration · mean"
      ),
      row(
        "fileKiB",
        "Encoded file",
        "#2563eb",
        "KiB",
        "Known file size · mean"
      ),
      row(
        "timingCoverage",
        "Known file sizes",
        "#64748b",
        "%",
        "Measurement coverage",
        undefined,
        { label: "Complete", value: 100 }
      ),
      row("errorsPerS", "Load errors", "#dc2626", "/s", "Failed responses"),
    ],
  },
  {
    section: "Preparation",
    rows: [
      row(
        "parseActive",
        "Active parsers",
        "#7c3aed",
        undefined,
        "Parser capacity",
        "Concurrency usage, not physical CPU utilization.",
        { label: "Parser slots", metric: "parseSlots" }
      ),
      row(
        "parsing",
        "Parse stage",
        "#7c3aed",
        undefined,
        "Pipeline backlog",
        "Active and waiting parse jobs."
      ),
      row("blocked", "Parked jobs", "#c2410c", undefined, "Pipeline backlog"),
      row(
        "parseQueueAgeMs",
        "Oldest pending",
        "#c2410c",
        "ms",
        "Parse queue wait"
      ),
      row(
        "parseWaitMs",
        "Completed · mean",
        "#7c3aed",
        "ms",
        "Parse queue wait"
      ),
      row(
        "prepareMs",
        "Preparation",
        "#7c3aed",
        "ms",
        "Payload preparation · mean"
      ),
      row(
        "decodedMiBs",
        "Decoded B3DM",
        "#7c3aed",
        "MiB/s",
        "Decoded input throughput",
        "Decoded payload bytes before parsing, not network bandwidth."
      ),
      row(
        "decodedFileKiB",
        "Decoded B3DM",
        "#7c3aed",
        "KiB",
        "Decoded payload size · mean"
      ),
    ],
  },
  {
    section: "Presentation & shadows",
    rows: [
      row("preparedPerS", "Prepared", "#7c3aed", "/s", "Mesh throughput"),
      row("presentedPerS", "Presented", "#15803d", "/s", "Mesh throughput"),
      row("displayed", "Displayed", "#15803d", undefined, "Published meshes"),
      row(
        "casters",
        "Casters",
        "#a16207",
        undefined,
        "Published meshes",
        "Includes visible meshes reused as casters; these counts overlap."
      ),
      row(
        "heldReceivers",
        "Waiting for casters",
        "#a16207",
        undefined,
        "Held receivers"
      ),
      row(
        "target",
        "Admission",
        "#334155",
        "CSS px",
        "Visible geometric SSE",
        "Current admission target; not the error of geometry already displayed."
      ),
      row(
        "visibleErrorMaxPx",
        "Visible max",
        "#dc2626",
        "CSS px",
        "Visible geometric SSE",
        "Maximum known geometric SSE of the exposed main-camera hierarchy cut. Fully covered REPLACE parents and branches whose children all miss the view are excluded. Terminal data LOD can exceed the requested target; not measured framebuffer error.",
        { label: "Coarse threshold", value: 20 }
      ),
      row(
        "visibleErrorMeanPx",
        "Visible mean",
        "#d97706",
        "CSS px",
        "Visible geometric SSE",
        "Mean geometric SSE over the exposed hierarchy cut, weighted by clipped bounds area. Partial parent/child footprints may overlap; this is not pixel visibility or measured image error."
      ),
      row(
        "visibleOver20Percent",
        "Over 20 px",
        "#dc2626",
        "%",
        "Coarse footprint share",
        "Share of exposed hierarchy-cut bounds area above 20 CSS px. Partial overlaps count separately; this approximates footprint area, not unique framebuffer pixels."
      ),
      row(
        "visibleOver20Ms",
        "Over 20 px",
        "#dc2626",
        "ms",
        "Current view coarse duration",
        "Since the exposed hierarchy cut first exceeded 20 CSS px. Resets on observer change or when no known coarse region remains; bounds-based, not framebuffer error."
      ),
    ],
  },
  {
    section: "Memory",
    rows: [
      row(
        "cacheMB",
        "Tile cache",
        "#2563eb",
        "MB",
        "Resident memory",
        "Estimated tile residency including reservations, not measured GPU memory.",
        { label: "Admission", metric: "cacheCeilingMB" }
      ),
      row(
        "heapMB",
        "JS heap",
        "#7c3aed",
        "MB",
        "JavaScript heap",
        "Browser-reported JS heap; not additive with tile cache estimates.",
        { label: "Heap limit", metric: "heapLimitMB" }
      ),
      row(
        "pressure",
        "Cache / ceiling",
        "#c2410c",
        "%",
        "Cache budget",
        undefined,
        { label: "Admission full", value: 100 }
      ),
      row("textures", "GPU textures", "#64748b", undefined, "Texture count"),
    ],
  },
  {
    section: "Rendering",
    rows: [
      row(
        "frameMs",
        "Frame interval · peak",
        "#2563eb",
        "ms",
        "Frame cadence",
        "Longest interval in this chart sample, not GPU duration. Reference assumes a 60 Hz target.",
        { label: "60 Hz budget", value: 1000 / 60 }
      ),
      row("traversalMs", "Tile traversal", "#7c3aed", "ms", "Tile selection"),
      row(
        "overlayMs",
        "Overview capture",
        "#0f766e",
        "ms",
        "Diagnostics overhead"
      ),
      row("chartMs", "Chart update", "#c2410c", "ms", "Diagnostics overhead"),
      row("triangles", "Triangles", "#15803d", "k", "Geometry"),
      row("drawCalls", "Draw calls", "#2563eb", undefined, "Draw submissions"),
    ],
  },
].flatMap(({ section, rows }) =>
  rows.map((metric) => ({ ...metric, section }))
);
