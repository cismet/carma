import type { Map as MapLibreMap } from "maplibre-gl";
import type { MetricRecorder } from "@carma-commons/ui/components";
import type {
  ThreeTilesRuntime,
  TileDiagnosticModel,
  TileDiagnosticSummary,
} from "@carma-mapping/engines/maplibre";
import { TILE_PIPELINE_CHART_ROWS as CHART_ROWS } from "./core/tile-pipeline-chart-rows";
import type { ResolvedDebugOptions } from "./tile-loading-debug-options";

export const captureTileLoadingDebugSnapshot = ({
  map,
  recorder,
  runtimeHandle,
  options,
  paused,
  summary,
  model,
  frozenImage,
}: {
  map: MapLibreMap;
  recorder: MetricRecorder;
  runtimeHandle: ThreeTilesRuntime;
  options: ResolvedDebugOptions;
  paused: boolean | null;
  summary: TileDiagnosticSummary | null;
  model: TileDiagnosticModel;
  frozenImage: string | null;
}) => {
  const page = window.open("", "_blank");
  if (!page) return;
  page.document.body.textContent = "Capturing current scene…";
  const snapshot = {
    capturedAt: new Date().toISOString(),
    story: location.href,
    browser: navigator.userAgent,
    debugEnabled: options.telemetryEnabled,
    paused: !!paused,
    camera: {
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      padding: map.getPadding(),
    },
    options,
    coverage: runtimeHandle.loading.getCoverageStatus(),
    summary,
    tiles: model.rects.map((tile) => ({
      id: tile.id,
      kind: tile.kind,
      quality: tile.quality,
      phase: tile.phase,
    })),
    logs: recorder.entries(),
    metrics: Object.fromEntries(
      CHART_ROWS.map(({ id }) => [id, recorder.series(id)])
    ),
    limitations:
      "Captured manager logs and bounded metric history only; not all browser console or network traffic. Debug-off snapshots have no newly recorded diagnostic history. Review URLs and image content before sharing.",
  };
  const finish = (screenshot: string | null, error?: string) => {
    const doc = document.implementation.createHTMLDocument(
      "Tile manager diagnostic snapshot"
    );
    const title = doc.createElement("h1");
    title.textContent = doc.title;
    const note = doc.createElement("p");
    note.textContent =
      "Local snapshot — download this HTML to share it; its temporary browser URL is not a public link. Images capture the map and camera canvases, not HTML overlays.";
    const copy = doc.createElement("button");
    copy.id = "copy";
    copy.textContent = "Copy state and logs";
    const download = doc.createElement("a");
    download.textContent = "Download complete HTML";
    download.download = "tile-manager-snapshot.html";
    const state = doc.createElement("textarea");
    state.id = "state";
    state.readOnly = true;
    state.value = JSON.stringify(
      { ...snapshot, screenshotError: error },
      null,
      2
    );
    state.textContent = state.value;
    state.style.cssText = "display:block;width:98%;height:50vh;margin-top:1em";
    doc.body.style.cssText = "font:14px system-ui;margin:24px";
    doc.body.append(title, note, copy, download);
    if (screenshot) {
      const image = doc.createElement("img");
      image.src = screenshot;
      image.alt = "Captured map canvas";
      image.style.cssText = "display:block;max-width:100%;margin-top:1em";
      doc.body.append(image);
    }
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      '[data-test-id="tile-manager-camera-preview"]'
    )) {
      try {
        const image = doc.createElement("img");
        image.src = canvas.toDataURL("image/png");
        image.alt = "Additional camera viewport";
        image.style.cssText =
          "display:inline-block;max-width:100%;transform:scaleY(-1);margin:8px";
        doc.body.append(image);
      } catch {
        /* The main state and other images remain exportable. */
      }
    }
    doc.body.append(state);
    const script = doc.createElement("script");
    script.textContent =
      "document.getElementById('copy').onclick=()=>{const t=document.getElementById('state');t.select();navigator.clipboard?.writeText(t.value).catch(()=>document.execCommand('copy'));};document.querySelector('a').href=location.href;";
    doc.body.append(script);
    const url = URL.createObjectURL(
      new Blob(["<!doctype html>" + doc.documentElement.outerHTML], {
        type: "text/html",
      })
    );
    page.location.href = url;
    // Keep the self-contained document available while its preview is open.
  };
  if (frozenImage) finish(frozenImage);
  else {
    map.once("render", () => {
      try {
        finish(map.getCanvas().toDataURL("image/png"));
      } catch (error) {
        finish(null, String(error));
      }
    });
    map.triggerRepaint();
  }
};
