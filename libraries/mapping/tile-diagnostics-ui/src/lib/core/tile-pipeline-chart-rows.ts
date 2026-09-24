import type { StripChartRow } from "@carma-commons/ui/components";

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const row = (
  id: string,
  label: string,
  color: string,
  unit?: string
): StripChartRow => ({
  id,
  label,
  color,
  unit,
  min: 0,
  format: (value) => (Number.isFinite(value) ? number.format(value) : "–"),
});

/** Shared by app, stories and the snapshot export. No story-owned configuration. */
export const TILE_PIPELINE_CHART_ROWS: readonly StripChartRow[] = [
  row("downloading", "live tile requests", "#ea580c"),
  row("downloadSlotsPerOrigin", "payload slots / origin", "#ea580c"),
  row("queued", "queued requests", "#ca8a04"),
  row("blocked", "parked pipeline jobs", "#ca8a04"),
  row("queueAgeMs", "oldest request queue wait", "#ca8a04", "ms"),
  row("requestAgeMs", "oldest live request", "#ea580c", "ms"),
  row("downloadsPerS", "mesh responses", "#ea580c", "/s"),
  row(
    "metadataReadyPerS",
    "metadata ready · worker/cache too",
    "#ea580c",
    "/s"
  ),
  row("downloadMiBs", "wire transfer · completed", "#ea580c", "MiB/s"),
  row("fileMiBs", "encoded bodies · completed", "#ea580c", "MiB/s"),
  row("decodedMiBs", "decoded B3DM · completed", "#ea580c", "MiB/s"),
  row("decodedFileKiB", "decoded B3DM size, mean", "#ea580c", "KiB"),
  row("fileKiB", "known file size, mean", "#ea580c", "KiB"),
  row("timingCoverage", "responses with known file sizes", "#ea580c", "%"),
  row("headersMs", "fetch to headers · observed mean", "#ea580c", "ms"),
  row("ttfbMs", "request to first byte, mean", "#ea580c", "ms"),
  row("bodyMs", "response body, mean", "#ea580c", "ms"),
  row("downloadMs", "whole request, mean", "#ea580c", "ms"),
  row("parseActive", "active payload parsers", "#dc2626"),
  row("parseSlots", "payload parse slots", "#dc2626"),
  row("parsing", "parse stage · active + waiting", "#dc2626"),
  row("parseQueueAgeMs", "oldest parse queue wait", "#dc2626", "ms"),
  row("parseWaitMs", "completed parse queue wait, mean", "#dc2626", "ms"),
  row("prepareMs", "payload preparation, mean", "#dc2626", "ms"),
  row("preparedPerS", "prepared meshes", "#dc2626", "/s"),
  row("presentedPerS", "newly presented meshes", "#16a34a", "/s"),
  row("heldReceivers", "receivers waiting for casters", "#a16207"),
  row("displayed", "displayed meshes", "#16a34a"),
  row("casters", "casters · including reused view", "#a16207"),
  row("errorsPerS", "load errors", "#dc2626", "/s"),
  row("cacheMB", "resident tile cache", "#475569", "MB"),
  row("pressure", "cache / ceiling", "#475569", "%"),
  row("heapMB", "JS heap", "#475569", "MB"),
  row("frameMs", "frame", "#2563eb", "ms"),
  row("traversalMs", "tile traversal", "#7c3aed", "ms"),
  row("overlayMs", "overview capture", "#0891b2", "ms"),
  row("chartMs", "chart push", "#0891b2", "ms"),
  row("triangles", "triangles", "#16a34a", "k"),
  row("drawCalls", "draw calls", "#16a34a"),
  row("textures", "GPU textures", "#475569"),
  row("target", "error target", "#0f172a", "px"),
];
