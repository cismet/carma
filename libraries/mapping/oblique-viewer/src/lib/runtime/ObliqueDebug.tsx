import { useEffect, useRef } from "react";
import { DiagnosticPanel } from "@carma-mapping/tile-diagnostics-ui";
import type {
  createPhotoAxisPicker,
  PhotoAxisSurfaceMode,
} from "./utils/photo-axis-picker";

type PreviewMemorySnapshot = {
  imageId: string;
  viewportPixels: number;
  imageBytes: number;
  imageBudgetBytes: number;
  sourceResidentBytes: number;
  workerResidentBytes: number;
  estimatedGpuBytes: number;
  sourceMemory?: {
    rangeBytes: number;
    decodedBytes: number;
    rangeCount: number;
    decodedTileCount: number;
    decodedPixels: number;
    largestDecodedTilePixels: number;
  };
  poolInstances: number;
  poolBytes: number;
  poolBudgetBytes: number;
};
const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " MiB";

/** Live values use a DOM subscription, keeping pointer updates out of the viewer's React tree. */
export default function ObliqueDebug({
  picker,
  surfaceMode,
  onSurfaceModeChange,
}: {
  picker: ReturnType<typeof createPhotoAxisPicker>;
  surfaceMode: PhotoAxisSurfaceMode;
  onSurfaceModeChange: (mode: PhotoAxisSurfaceMode) => void;
}) {
  const distance = useRef<HTMLOutputElement>(null);
  const image = useRef<HTMLOutputElement>(null);
  const memoryOutputs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const update = (event: Event) => {
      const memory = (event as CustomEvent<PreviewMemorySnapshot>).detail;
      const values = [
        memory.viewportPixels
          ? `Bild ${memory.imageId}: ${mib(memory.imageBytes)} / ${mib(memory.imageBudgetBytes)} (4× physischer Viewport)`
          : "Kein Preview aktiv",
        `Viewport ${memory.viewportPixels.toLocaleString("de-DE")} px · Quelle ${mib(memory.sourceResidentBytes)} · Worker ${mib(memory.workerResidentBytes)} · GPU ${mib(memory.estimatedGpuBytes)}`,
        `Pool ${memory.poolInstances} Bilder · ${mib(memory.poolBytes)} / ${mib(memory.poolBudgetBytes)}`,
        `AVIF-Zellen ${memory.sourceMemory?.decodedTileCount ?? 0} · ${mib(memory.sourceMemory?.decodedBytes ?? 0)} decodiert · ${mib(memory.sourceMemory?.rangeBytes ?? 0)} Range-Cache`,
      ];
      values.forEach((text, index) => {
        const output = memoryOutputs.current[index];
        if (output && output.textContent !== text) output.textContent = text;
      });
    };
    globalThis.window.addEventListener("carma-oblique-preview-memory", update);
    return () =>
      globalThis.window.removeEventListener(
        "carma-oblique-preview-memory",
        update
      );
  }, []);
  useEffect(
    () =>
      picker.subscribe((value) => {
        if (distance.current)
          distance.current.textContent = value
            ? value.distance.toLocaleString("de-DE", {
                maximumFractionDigits: 2,
              }) + " m"
            : "—";
        if (image.current)
          image.current.textContent = value
            ? value.seriesId +
              " · " +
              value.imageId +
              " (" +
              value.surface +
              ")"
            : "Kein Oberflächentreffer";
      }),
    [picker]
  );
  return (
    <div style={{ pointerEvents: "auto" }}>
      <DiagnosticPanel
        title="Schrägluftbilder · Debug"
        defaultPosition={{ left: 60, top: 300 }}
        testId="oblique-viewer-debug"
      >
        <div
          style={{
            padding: 8,
            font: "12px system-ui",
            display: "grid",
            gap: 4,
          }}
        >
          <span>Zeiger → Katalog-Grundzentrum (Referenzhöhe)</span>
          <label style={{ display: "grid", gap: 4 }}>
            Schnittfläche
            <select
              aria-label="Schnittfläche für Punktabfrage"
              data-test-id="oblique-intersection-surface"
              value={surfaceMode}
              onChange={(event) =>
                onSurfaceModeChange(event.currentTarget.value as PhotoAxisSurfaceMode)
              }
            >
              <option value="auto">Automatisch (Mesh + DEM)</option>
              <option value="mesh">Mesh</option>
              <option value="terrain">DEM</option>
            </select>
          </label>
          <output ref={distance} data-test-id="oblique-axis-distance">
            —
          </output>
          <output ref={image} />
          <fieldset
            data-test-id="oblique-preview-memory"
            style={{
              display: "grid",
              gap: 3,
              margin: "6px 0 0",
              padding: 6,
              border: "1px solid rgba(255,255,255,.25)",
            }}
          >
            <legend>Verwalteter Bildspeicher (RGBA-Schätzung)</legend>
            {["Kein Preview aktiv", "—", "—", "—"].map((text, index) => (
              <span
                key={index}
                ref={(element) => {
                  memoryOutputs.current[index] = element;
                }}
              >
                {text}
              </span>
            ))}
            <small>GPU-Kopie geschätzt; zusätzlicher Browser- und Decoder-Speicher unbekannt.</small>
          </fieldset>
        </div>
      </DiagnosticPanel>
    </div>
  );
}
