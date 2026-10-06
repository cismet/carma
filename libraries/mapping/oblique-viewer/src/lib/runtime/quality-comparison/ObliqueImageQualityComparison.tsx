import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import {
  chooseImageQualityVariant,
  parseImageQualityManifest,
  type ImageQualityManifest,
  type ImageQualitySource,
  type ImageQualityPreset,
} from "../../core/utils/image-quality-comparison";
import {
  createComparisonClient,
  type ComparisonReply,
} from "./comparison-client";

export type ObliqueImageQualityComparisonProps = {
  manifestUrl: string;
  qualityTarget: number;
  onQualityTargetChange: (target: number) => void;
};
const CASES = [
  { bitDepth: 10, chroma: "444" },
  { bitDepth: 10, chroma: "420" },
  { bitDepth: 8, chroma: "444" },
  { bitDepth: 8, chroma: "420" },
] as const;
type Center = { x: DevicePixels; y: DevicePixels };
const format = (value: number, digits = 1) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    value
  );

function Pane({
  source,
  bitDepth,
  chroma,
  target,
  center,
  scale,
  workerUrl,
  onPan,
  showReference,
  showError,
}: {
  source: ImageQualitySource;
  bitDepth: 8 | 10;
  chroma: "444" | "420";
  target: number;
  center: Center;
  scale: Ratio;
  workerUrl: string;
  onPan: (x: DevicePixels, y: DevicePixels) => void;
  showReference: boolean;
  showError: boolean;
}) {
  const selected = chooseImageQualityVariant(
    source.variants,
    bitDepth,
    chroma,
    target
  );
  const sameDepth444 = chooseImageQualityVariant(
    source.variants,
    bitDepth,
    "444",
    target
  );
  const sizeDifference =
    chroma === "420" &&
    selected.meetsTarget &&
    sameDepth444.meetsTarget &&
    selected.variant &&
    sameDepth444.variant
      ? (selected.variant.bytes / sameDepth444.variant.bytes - 1) * 100
      : null;
  const frame = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const client = useRef<ReturnType<typeof createComparisonClient> | null>(null);
  const [size, setSize] = useState({
    width: 1 as CssPixels,
    height: 1 as CssPixels,
    dpr: 1 as Ratio,
  });
  const [reply, setReply] = useState<ComparisonReply | null>(null);
  const [renderedMode, setRenderedMode] = useState<string | undefined>();
  const requestedMode = useRef("image");
  const [precision, setPrecision] = useState("unorm8");
  const dragging = useRef<{
    x: CssPixels;
    y: CssPixels;
    center: Center;
  } | null>(null);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const resize = () => {
      const bounds = node.getBoundingClientRect();
      setSize((previous) => {
        const next = {
          width: Math.max(1, bounds.width) as CssPixels,
          height: Math.max(1, bounds.height) as CssPixels,
          dpr: (globalThis.devicePixelRatio || 1) as Ratio,
        };
        return previous.width === next.width &&
          previous.height === next.height &&
          previous.dpr === next.dpr
          ? previous
          : next;
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const receive = (next: ComparisonReply) => {
      if (next.bitmap && canvas.current) {
        const node = canvas.current;
        const settings: CanvasRenderingContext2DSettings & {
          colorType: string;
        } = { alpha: false, colorSpace: "srgb", colorType: "float16" };
        const context = node.getContext("2d", settings);
        try {
          if (!context) throw new Error("No comparison canvas");
          if (node.width !== next.bitmap.width) node.width = next.bitmap.width;
          if (node.height !== next.bitmap.height)
            node.height = next.bitmap.height;
          context.drawImage(next.bitmap, 0, 0);
          setRenderedMode(requestedMode.current);
          const attributes =
            context.getContextAttributes() as CanvasRenderingContext2DSettings & {
              colorType?: string;
            };
          setPrecision(attributes.colorType ?? "unorm8");
        } finally {
          next.bitmap.close();
        }
      }
      setReply(next);
    };
    const connection = createComparisonClient(workerUrl, receive);
    client.current = connection;
    return () => {
      connection.dispose();
      client.current = null;
    };
  }, [workerUrl]);
  useEffect(() => {
    client.current?.cancel();
    setReply(null);
    setRenderedMode(undefined);
  }, [selected.variant, showReference, showError]);
  useEffect(() => {
    if (!selected.variant || size.width <= 1 || size.height <= 1) return;
    const width = Math.min(
      source.width,
      Math.max(1, Math.floor((size.width * size.dpr) / scale))
    );
    const height = Math.min(
      source.height,
      Math.max(1, Math.floor((size.height * size.dpr) / scale))
    );
    const x = Math.max(
      0,
      Math.min(source.width - width, Math.round(center.x - width / 2))
    );
    const y = Math.max(
      0,
      Math.min(source.height - height, Math.round(center.y - height / 2))
    );
    const timer = setTimeout(() => {
      requestedMode.current = showError
        ? "error"
        : showReference
        ? "reference"
        : "image";
      if (showError && selected.variant?.errorTiles)
        client.current?.loadError(selected.variant, [
          x,
          y,
          x + width,
          y + height,
        ]);
      else if (showReference && source.referenceTiles)
        client.current?.loadReference(source, [x, y, x + width, y + height]);
      else
        client.current?.load(selected.variant!, [x, y, x + width, y + height]);
    }, 70);
    return () => clearTimeout(timer);
  }, [
    selected.variant,
    center.x,
    center.y,
    size.width,
    size.height,
    size.dpr,
    scale,
    source.width,
    source.height,
    source.referenceTiles,
    showReference,
    showError,
  ]);
  const bounds = reply?.bounds;
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = {
      x: event.clientX as CssPixels,
      y: event.clientY as CssPixels,
      center,
    };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragging.current;
    if (start)
      onPan(
        (start.center.x -
          ((event.clientX - start.x) * size.dpr) / scale) as DevicePixels,
        (start.center.y -
          ((event.clientY - start.y) * size.dpr) / scale) as DevicePixels
      );
  };
  return (
    <section
      data-bit-depth={bitDepth}
      data-chroma={chroma}
      data-comparison-mode={
        showError ? "error" : showReference ? "reference" : "image"
      }
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "subgrid",
        gridRow: "span 3",
        border: "1px solid #777",
      }}
    >
      <header
        style={{
          padding: "5px 8px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong>
          {bitDepth} Bit · {chroma === "444" ? "4:4:4" : "4:2:0"}
        </strong>
        {showReference && <strong>Originalreferenz · PNG verlustfrei</strong>}
        {showError && <strong>RGB-Fehler ×32 (offline)</strong>}
        {selected.variant && (
          <span style={{ fontSize: 12 }}>
            AVIF: {format(selected.variant.ssimulacra2, 2)} Punkte · Q
            {selected.variant.encoderQuality} ·{" "}
            {format(selected.variant.bytes / 1024)} KiB
          </span>
        )}
        {sizeDifference !== null && sameDepth444.variant && (
          <span style={{ fontSize: 11 }}>
            4:2:0{" "}
            {sizeDifference === 0
              ? "gleich groß"
              : `${format(Math.abs(sizeDifference), 2)} % ${
                  sizeDifference < 0 ? "kleiner" : "größer"
                }`}{" "}
            als 4:4:4 bei Ziel {format(target)} Punkten · Vergleich Q
            {sameDepth444.variant.encoderQuality},{" "}
            {format(sameDepth444.variant.ssimulacra2, 2)} Punkte
          </span>
        )}
        {!selected.meetsTarget && (
          <span style={{ color: "#b91c1c", fontSize: 12 }}>
            Qualitätsziel nicht erreicht
          </span>
        )}
      </header>
      <div
        ref={frame}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          touchAction: "none",
          background: "#181818",
          cursor: "grab",
        }}
      >
        <canvas
          ref={canvas}
          data-loaded-comparison-mode={renderedMode}
          data-source-bounds={reply?.bounds?.join(",")}
          data-error-tile-base={selected.variant?.errorTiles?.baseUrl}
          style={{
            position: "absolute",
            left: bounds
              ? size.width / 2 + ((bounds[0] - center.x) * scale) / size.dpr
              : 0,
            top: bounds
              ? size.height / 2 + ((bounds[1] - center.y) * scale) / size.dpr
              : 0,
            width: bounds ? ((bounds[2] - bounds[0]) * scale) / size.dpr : 0,
            height: bounds ? ((bounds[3] - bounds[1]) * scale) / size.dpr : 0,
            imageRendering: scale > 1 ? "pixelated" : "auto",
          }}
        />
        {reply?.error && (
          <span
            role="alert"
            style={{ position: "absolute", inset: 8, color: "white" }}
          >
            {reply.error}
          </span>
        )}
      </div>
      <footer style={{ padding: "4px 8px", fontSize: 12 }}>
        {showError
          ? "Fehler-PNG (keine Codec-Ladezeit) · vorab berechneter Decoderfehler"
          : showReference
          ? "Referenz-PNG (keine Codec-Ladezeit)"
          : reply?.loadMs !== undefined
          ? `${format(reply.loadMs)} ms · ${format(
              (reply.requestedBytes ?? 0) / 1024
            )} KiB Range · ${reply.tileCount} Kacheln`
          : "Bild wird geladen …"}
        {selected.variant?.offlineRGBPsnrDb !== undefined && (
          <span>
            {" "}
            · Offline RGB-PSNR {format(selected.variant.offlineRGBPsnrDb, 2)} dB
          </span>
        )}
        <span style={{ float: "right" }}>Canvas {precision}</span>
      </footer>
    </section>
  );
}

const FALLBACK_PRESETS: readonly ImageQualityPreset[] = [
  { id: "scene", label: "Gesamtszene", center: [0.5, 0.5] },
];
const presetLabel = (preset: ImageQualityPreset) => {
  if (/facade|fassade/i.test(preset.id + preset.label)) return "Fassade";
  if (/roof|dach/i.test(preset.id + preset.label)) return "Helles Flachdach";
  if (/scene|szene|overview/i.test(preset.id + preset.label))
    return "Gesamtszene";
  return preset.label;
};
const presetsOf = (source: ImageQualitySource) =>
  source.presets ?? FALLBACK_PRESETS;

/** Measured assets with one normalized pan position and common L0 extent. */
export default function ObliqueImageQualityComparison({
  manifestUrl,
  qualityTarget,
  onQualityTargetChange,
}: ObliqueImageQualityComparisonProps) {
  const [manifest, setManifest] = useState<ImageQualityManifest | null>(null),
    [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [position, setPosition] = useState({ x: 0.49, y: 0.065 });
  const [presetId, setPresetId] = useState("facade");
  const [scale, setScale] = useState(2 as Ratio);
  const [showReference, setShowReference] = useState(false);
  const [showError, setShowError] = useState(false);
  const [nativePrecision, setNativePrecision] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setNativePrecision(null);
    void (async () => {
      const counts: number[] = [];
      for (const depth of [8, 10]) {
        const url = new URL(`../gray-proof/gray${depth}.avif`, manifestUrl);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Precision probe unavailable");
        const bitmap = await createImageBitmap(await response.blob());
        try {
          const surface = new OffscreenCanvas(bitmap.width, 1);
          const settings: CanvasRenderingContext2DSettings & {
            colorType: string;
          } = {
            colorType: "float16",
            colorSpace: "srgb",
          };
          const context = surface.getContext("2d", settings);
          if (!context) throw new Error("Precision canvas unavailable");
          context.drawImage(bitmap, 0, 0);
          const pixelSettings: ImageDataSettings & { pixelFormat: string } = {
            pixelFormat: "rgba-float16",
          };
          const data = context.getImageData(
            0,
            0,
            bitmap.width,
            1,
            pixelSettings
          ).data;
          counts.push(
            new Set(Array.from({ length: bitmap.width }, (_, x) => data[x * 4]))
              .size
          );
        } finally {
          bitmap.close();
        }
      }
      if (!controller.signal.aborted)
        setNativePrecision(
          `Native Graustufen: 8 Bit → ${counts[0]}, 10 Bit → ${counts[1]}${
            counts[1] <= 256
              ? "; nativer 10-Bit-Decode kann auf 8 Bit reduziert sein — Fehleransicht vergleichen"
              : ""
          }`
        );
    })().catch(() => {
      if (!controller.signal.aborted)
        setNativePrecision("Native Präzisionsprobe nicht verfügbar");
    });
    return () => controller.abort();
  }, [manifestUrl]);
  useEffect(() => {
    const controller = new AbortController();
    setManifest(null);
    setError(null);
    void fetch(manifestUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Comparison manifest: ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        if (controller.signal.aborted) return;
        const next = parseImageQualityManifest(raw, manifestUrl);
        const first =
          next.sources.find(
            (source) =>
              source.level === 2 &&
              /north|nord/i.test(source.groupId ?? source.id)
          ) ??
          next.sources.find((source) => source.level === 2) ??
          next.sources[0];
        const preset =
          presetsOf(first).find(
            (preset) => presetLabel(preset) === "Fassade"
          ) ?? presetsOf(first)[0];
        setManifest(next);
        setSourceId(first.id);
        setPresetId(preset.id);
        setPosition({ x: preset.center[0], y: preset.center[1] });
        setScale((8 / 2 ** (first.level ?? 0)) as Ratio);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [manifestUrl]);
  const source = manifest?.sources.find((source) => source.id === sourceId);
  const hasLevels =
    manifest?.sources.some((source) => source.level !== undefined) ?? false;
  const levelFactor = 2 ** (source?.level ?? 0);
  const effectiveScale = (scale * levelFactor) as Ratio;
  const center: Center = {
    x: ((source?.width ?? 0) * position.x) as DevicePixels,
    y: ((source?.height ?? 0) * position.y) as DevicePixels,
  };
  const groups =
    manifest?.sources.filter(
      (source, index, sources) =>
        sources.findIndex(
          (other) =>
            (other.groupId ?? other.id) === (source.groupId ?? source.id)
        ) === index
    ) ?? [];
  const levels =
    manifest?.sources
      .filter(
        (candidate) =>
          (candidate.groupId ?? candidate.id) ===
          (source?.groupId ?? source?.id)
      )
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0)) ?? [];
  const presets = source ? presetsOf(source) : [];
  const selected = source
    ? CASES.map((config) =>
        chooseImageQualityVariant(
          source.variants,
          config.bitDepth,
          config.chroma,
          qualityTarget
        )
      )
    : [];
  const errorAvailable =
    selected.length === CASES.length &&
    selected.every((choice) => Boolean(choice.variant?.errorTiles));
  const activeError = showError && errorAvailable;
  const activeReference =
    showReference && Boolean(source?.referenceTiles) && !activeError;
  const selectSource = (next: ImageQualitySource) => {
    const changedGroup =
      (source?.groupId ?? source?.id) !== (next.groupId ?? next.id);
    if (changedGroup && presetId) {
      const preset = presetsOf(next).find((preset) => preset.id === presetId);
      if (preset) setPosition({ x: preset.center[0], y: preset.center[1] });
      else setPresetId("");
    }
    setSourceId(next.id);
  };
  const selectLevel = (level: number) => {
    const next = levels.find((candidate) => candidate.level === level);
    if (next) selectSource(next);
  };
  const pan = useCallback(
    (x: DevicePixels, y: DevicePixels) => {
      if (source) {
        setPosition({
          x: Math.max(0, Math.min(1, x / source.width)),
          y: Math.max(0, Math.min(1, y / source.height)),
        });
        setPresetId("");
      }
    },
    [source]
  );
  return (
    <div
      data-source-id={source?.id}
      data-source-level={source?.level}
      data-normalized-center={`${position.x},${position.y}`}
      data-current-pixel-scale={effectiveScale}
      style={{
        height: "calc(100vh - 32px)",
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        color: "#222",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
          padding: "4px 0",
          position: "sticky",
          top: 0,
          background: "white",
          zIndex: 1,
          fontSize: 12,
        }}
      >
        <label>
          SSIMULACRA2-Ziel{" "}
          <input
            aria-label="Gemeinsames Qualitätsziel"
            type="range"
            min={70}
            max={99}
            step={0.5}
            value={qualityTarget}
            onChange={(event) =>
              onQualityTargetChange(Number(event.target.value))
            }
          />{" "}
          {format(qualityTarget)} Punkte
        </label>
        <select
          aria-label="Vergleichsausschnitt"
          value={source?.groupId ?? sourceId}
          onChange={(event) => {
            const matches =
              manifest?.sources.filter(
                (candidate) =>
                  (candidate.groupId ?? candidate.id) === event.target.value
              ) ?? [];
            const next =
              matches.find((candidate) => candidate.level === source?.level) ??
              matches[0];
            if (next) selectSource(next);
          }}
        >
          {groups.map((source) => (
            <option
              key={source.groupId ?? source.id}
              value={source.groupId ?? source.id}
            >
              {source.label}
            </option>
          ))}
        </select>
        {hasLevels && (
          <>
            <label>
              Stufe{" "}
              <select
                aria-label="Quellstufe"
                value={source?.level ?? 0}
                onChange={(event) => selectLevel(Number(event.target.value))}
              >
                {levels.map((candidate) => (
                  <option key={candidate.id} value={candidate.level}>
                    L{candidate.level} · {candidate.width}×{candidate.height}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ display: "inline-flex", gap: 2 }}>
              {[1, 2, 3]
                .filter((level) =>
                  levels.some((candidate) => candidate.level === level)
                )
                .map((level) => (
                  <button
                    key={level}
                    onClick={() => selectLevel(level)}
                    aria-pressed={source?.level === level}
                  >
                    L{level}
                  </button>
                ))}
            </span>
          </>
        )}
        <select
          aria-label="Motivposition"
          value={presetId}
          onChange={(event) => {
            const preset = presets.find(
              (preset) => preset.id === event.target.value
            );
            if (preset) {
              setPresetId(preset.id);
              setPosition({ x: preset.center[0], y: preset.center[1] });
            }
          }}
        >
          {!presetId && <option value="">Freie Position</option>}
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {presetLabel(preset)}
            </option>
          ))}
        </select>
        {[1, 2, 4, 8].map((value) => (
          <button
            key={value}
            onClick={() => setScale((value / levelFactor) as Ratio)}
            aria-pressed={effectiveScale === value}
          >
            {value}×{value === 1 ? " (1:1)" : ""}
          </button>
        ))}
        <span>
          {format(effectiveScale)}× physische Pixel
          {source?.level !== undefined ? ` L${source.level}` : ""}
        </span>
        {source?.referenceTiles && (
          <label>
            <input
              type="checkbox"
              checked={activeReference}
              onChange={(event) => {
                setShowReference(event.target.checked);
                if (event.target.checked) setShowError(false);
              }}
            />{" "}
            PNG-Referenz
          </label>
        )}
        {errorAvailable && (
          <button
            aria-pressed={activeError}
            onClick={() => {
              setShowError(!activeError);
              setShowReference(false);
            }}
          >
            RGB-Fehler ×32 (offline)
          </button>
        )}
        <span style={{ width: "100%", fontSize: 11 }}>
          {nativePrecision ?? "Native Präzision wird geprüft …"}
          {activeError &&
            " · Vorab berechneter RGB-Fehler des hochpräzisen Decoders, kein Foto und kein Ladebenchmark"}
        </span>
      </header>
      {error && <p role="alert">{error}</p>}
      {!source && !error && <p role="status">Messdaten werden geladen …</p>}
      {source && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows:
              "auto minmax(0, 1fr) auto auto minmax(0, 1fr) auto",
            gap: 4,
          }}
        >
          {CASES.map((config) => (
            <Pane
              key={`${source.id}:${config.bitDepth}:${config.chroma}`}
              source={source}
              {...config}
              target={qualityTarget}
              center={center}
              scale={effectiveScale}
              showReference={activeReference}
              showError={activeError}
              workerUrl={new URL("comparison-worker.mjs", manifestUrl).href}
              onPan={pan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
