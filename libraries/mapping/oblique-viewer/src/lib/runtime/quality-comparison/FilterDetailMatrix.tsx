import { useEffect, useRef, useState, type PointerEvent } from "react";

type MatrixVariant = {
  motif: string;
  level: string;
  kernel: string;
  weight: number;
  width: number;
  height: number;
  href: string;
  bytes: number;
  metrics: {
    rmsRgb8: number;
    maxAbsRgb8: number;
    laplacianRmsRgb8: number;
    localLumaExcursionRgb8: number;
    localLumaExcursionPixelsPercent: number;
  };
};
type MatrixManifest = {
  schemaVersion: number;
  title: string;
  weights: number[];
  kernels: { id: string; label: string }[];
  motifs: {
    id: string;
    label: string;
    defaultCenterByLevel?: Record<string, { x: number; y: number }>;
  }[];
  levels: string[];
  variants: MatrixVariant[];
  sourceInfo?: string;
};
export type FilterDetailMatrixProps = {
  manifestUrl: string;
  motif: string;
  level: string;
  magnification: number;
  showContrastMetrics?: boolean;
  onMotifChange?: (motif: string) => void;
  onLevelChange?: (level: string) => void;
};

export default function FilterDetailMatrix({
  manifestUrl,
  motif,
  level,
  magnification,
  showContrastMetrics = false,
  onMotifChange,
  onLevelChange,
}: FilterDetailMatrixProps) {
  const [manifest, setManifest] = useState<MatrixManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const firstCell = useRef<HTMLDivElement | null>(null);
  const cellSize = useRef({ width: 150, height: 150 });
  const overview = useRef<HTMLDivElement | null>(null);
  const selection = useRef<HTMLDivElement | null>(null);
  const overviewBounds = useRef({ left: 0, top: 0, width: 180, height: 180 });
  const overviewDragging = useRef(false);
  const overviewDragOffset = useRef({ x: 0, y: 0 });
  const center = useRef({ x: 0.5, y: 0.5 });
  const nextCenter = useRef(center.current);
  const frame = useRef<number | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    center: { x: number; y: number };
  } | null>(null);
  const geometry = useRef({ width: 256, height: 256, magnification, dpr });
  const apply = () => {
    const current = geometry.current,
      width = (current.width * current.magnification) / current.dpr,
      height = (current.height * current.magnification) / current.dpr;
    const minX =
      width > cellSize.current.width
        ? cellSize.current.width / (2 * width)
        : 0.5;
    const minY =
      height > cellSize.current.height
        ? cellSize.current.height / (2 * height)
        : 0.5;
    nextCenter.current = {
      x: Math.max(0, Math.min(1, nextCenter.current.x)),
      y: Math.max(0, Math.min(1, nextCenter.current.y)),
    };
    center.current = {
      x: Math.max(minX, Math.min(1 - minX, nextCenter.current.x)),
      y: Math.max(minY, Math.min(1 - minY, nextCenter.current.y)),
    };
    if (selection.current) {
      const cropWidth = Math.min(1, cellSize.current.width / width),
        cropHeight = Math.min(1, cellSize.current.height / height);
      selection.current.style.width = `${cropWidth * 100}%`;
      selection.current.style.height = `${cropHeight * 100}%`;
      selection.current.style.left = `${
        (center.current.x - cropWidth / 2) * 100
      }%`;
      selection.current.style.top = `${
        (center.current.y - cropHeight / 2) * 100
      }%`;
    }
    for (const image of images.current) {
      if (image)
        image.style.transform = `translate(${-center.current.x * width}px, ${
          -center.current.y * height
        }px)`;
    }
  };
  const requestPan = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      apply();
    });
  };
  useEffect(() => {
    const controller = new AbortController();
    setManifest(null);
    setError(null);
    fetch(manifestUrl, { signal: controller.signal, cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Filtermatrix konnte nicht geladen werden.");
        const data = (await response.json()) as MatrixManifest;
        if (
          !Array.isArray(data.weights) ||
          !Array.isArray(data.kernels) ||
          !Array.isArray(data.variants)
        )
          throw new Error("Filtermatrix ist unvollständig.");
        setManifest(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Filtermatrix konnte nicht geladen werden."
          );
      });
    return () => controller.abort();
  }, [manifestUrl]);
  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );
  const rows =
    manifest?.kernels.map((kernel) => ({
      kernel,
      cells: manifest.weights.map((weight) =>
        manifest.variants.find(
          (variant) =>
            variant.motif === motif &&
            variant.level === level &&
            variant.kernel === kernel.id &&
            Math.abs(variant.weight - weight) < 1e-8
        )
      ),
    })) ?? [];
  useEffect(() => {
    const node = firstCell.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      cellSize.current = { width: bounds.width, height: bounds.height };
      requestPan();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [manifest, motif, level]);
  useEffect(() => {
    const node = overview.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (bounds)
        overviewBounds.current = {
          ...overviewBounds.current,
          width: bounds.width,
          height: bounds.height,
        };
      requestPan();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [manifest, motif, level]);
  const first = rows[0]?.cells[0];
  geometry.current = {
    width: first?.width ?? 256,
    height: first?.height ?? 256,
    magnification,
    dpr,
  };
  useEffect(() => {
    nextCenter.current = manifest?.motifs.find((value) => value.id === motif)
      ?.defaultCenterByLevel?.[level] ?? { x: 0.5, y: 0.5 };
    drag.current = null;
    setImageError(false);
    requestPan();
  }, [manifest, motif, level]);
  useEffect(() => {
    requestPan();
  }, [magnification, dpr, first?.width, first?.height]);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      center: { ...center.current },
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const current = geometry.current,
      width = (current.width * current.magnification) / current.dpr,
      height = (current.height * current.magnification) / current.dpr;
    nextCenter.current = {
      x: drag.current.center.x - (event.clientX - drag.current.x) / width,
      y: drag.current.center.y - (event.clientY - drag.current.y) / height,
    };
    requestPan();
  };
  const overviewPoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = overviewBounds.current;
    nextCenter.current = {
      x:
        (event.clientX - bounds.left) / bounds.width -
        overviewDragOffset.current.x,
      y:
        (event.clientY - bounds.top) / bounds.height -
        overviewDragOffset.current.y,
    };
    requestPan();
  };
  const overviewDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    overviewBounds.current = {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    const point = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
    const current = geometry.current,
      cropWidth = Math.min(
        1,
        (cellSize.current.width * current.dpr) /
          current.magnification /
          current.width
      ),
      cropHeight = Math.min(
        1,
        (cellSize.current.height * current.dpr) /
          current.magnification /
          current.height
      );
    const inside =
      Math.abs(point.x - center.current.x) <= cropWidth / 2 &&
      Math.abs(point.y - center.current.y) <= cropHeight / 2;
    overviewDragOffset.current = inside
      ? { x: point.x - center.current.x, y: point.y - center.current.y }
      : { x: 0, y: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    overviewDragging.current = true;
    overviewPoint(event);
  };
  if (error)
    return (
      <main>
        <p role="alert">{error}</p>
      </main>
    );
  if (!manifest)
    return (
      <main>
        <p>Filtermatrix wird geladen …</p>
      </main>
    );
  const missing = rows.some((row) => row.cells.some((cell) => !cell));
  const imageWidth = (geometry.current.width * magnification) / dpr,
    imageHeight = (geometry.current.height * magnification) / dpr;
  let imageIndex = 0;
  return (
    <main className="filter-detail-matrix">
      <style>{`
      .filter-detail-matrix { font:15px/1.4 system-ui,sans-serif; background:#f7f7f5; color:#202020; min-height:100vh; }
      .filter-detail-matrix * { box-sizing:border-box; }
      .filter-detail-matrix .content { width:100%; max-width:1250px; margin:auto; padding:10px 14px; }
      .filter-detail-matrix header { position:sticky; top:0; z-index:2; background:#f7f7f5; border-bottom:1px solid #bbb; }
      .filter-detail-matrix h1 { font-size:20px; margin:0 0 4px; }
      .filter-detail-matrix p { margin:5px 0; max-width:1100px; }
      .filter-detail-matrix button { font:inherit; padding:5px 12px; min-height:34px; border:1px solid #666; background:#fff; margin-top:6px; cursor:pointer; }
      .filter-detail-matrix .matrix { display:grid; width:100%; gap:8px; grid-template-columns:75px repeat(${manifest.weights.length},minmax(0,1fr)); align-items:start; }
      .filter-detail-matrix .column { text-align:center; font-weight:650; overflow-wrap:anywhere; }
      .filter-detail-matrix .pure-reference { border-left:2px solid #707070; padding-left:6px; }
      .filter-detail-matrix .row-label { font-weight:650; padding-top:8px; }
      .filter-detail-matrix figure { margin:0; min-width:0; }
      .filter-detail-matrix .cell { position:relative; width:100%; aspect-ratio:1; overflow:hidden; touch-action:none; cursor:grab; background:#181818; }
      .filter-detail-matrix .navigation { display:flex; gap:16px; align-items:center; margin-bottom:10px; }
      .filter-detail-matrix .overview { width:180px; flex:0 0 180px; aspect-ratio:1; position:relative; touch-action:none; cursor:crosshair; overflow:hidden; background:#181818; }
      .filter-detail-matrix .overview img { width:100%; height:100%; object-fit:contain; image-rendering:auto; }
      .filter-detail-matrix .selection { position:absolute; border:2px solid #ffd900; box-shadow:0 0 0 1px #151515; pointer-events:none; }
      .filter-detail-matrix .selectors { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      .filter-detail-matrix select { font:inherit; padding:5px; min-height:34px; }
      .filter-detail-matrix img { position:absolute; display:block; max-width:none; user-select:none; pointer-events:none; }
      .filter-detail-matrix figcaption { font-size:12px; padding-top:5px; }
    `}</style>
      <header>
        <div className="content">
          <h1>{manifest.title || "Detailfilter-Matrix L2 / L3 / L4"}</h1>
          <div className="selectors">
            {onMotifChange && (
              <label>
                Motiv{" "}
                <select
                  aria-label="Motiv"
                  value={motif}
                  onChange={(event) => onMotifChange(event.target.value)}
                >
                  {manifest.motifs.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {onLevelChange && (
              <label>
                Stufe{" "}
                <select
                  aria-label="Stufe"
                  value={level}
                  onChange={(event) => onLevelChange(event.target.value)}
                >
                  {manifest.levels.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p>
            {manifest.motifs.find((value) => value.id === motif)?.label ??
              motif}{" "}
            · {level} · {magnification}× Pixelinspektion · gleiche physische
            Pixelskala in allen Zellen.
          </p>
          <p>
            Bild = (1 − w) × Triangle + w × Kernel. Detailmischungen: 0–20 %
            Kernel.{" "}
            {manifest.weights.includes(1) && (
              <>Zusätzlich: reine 100-%-Kernelreferenz (w = 1).</>
            )}
          </p>
          <button
            onClick={() => {
              nextCenter.current = { x: 0.5, y: 0.5 };
              requestPan();
            }}
          >
            Zentrieren
          </button>
        </div>
      </header>
      <div className="content">
        {first && (
          <div className="navigation">
            <div
              ref={overview}
              className="overview"
              data-filter-overview
              role="application"
              aria-label="Detailbereich in der Übersicht wählen"
              tabIndex={0}
              onPointerDown={overviewDown}
              onPointerMove={(event) => {
                if (overviewDragging.current) overviewPoint(event);
              }}
              onPointerUp={() => {
                overviewDragging.current = false;
              }}
              onPointerCancel={() => {
                overviewDragging.current = false;
              }}
              onKeyDown={(event) => {
                const step = 0.025;
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                nextCenter.current = {
                  x:
                    nextCenter.current.x +
                    (event.key === "ArrowLeft"
                      ? -step
                      : event.key === "ArrowRight"
                      ? step
                      : 0),
                  y:
                    nextCenter.current.y +
                    (event.key === "ArrowUp"
                      ? -step
                      : event.key === "ArrowDown"
                      ? step
                      : 0),
                };
                requestPan();
              }}
            >
              <img
                src={new URL(first.href, manifestUrl).href}
                alt="Triangle-Kontextübersicht"
                draggable={false}
                onLoad={requestPan}
              />
              <div
                ref={selection}
                className="selection"
                data-filter-selection
              />
            </div>
            <p>
              Detailbereich in der Übersicht anklicken oder ziehen. Der gelbe
              Rahmen entspricht dem sichtbaren Ausschnitt aller{" "}
              {manifest.kernels.length * manifest.weights.length} Zellen. Die
              Übersicht ist zur Navigation skaliert; die Vergleichszellen
              behalten die gewählte physische Pixelskala.
            </p>
          </div>
        )}
        {missing && (
          <p role="alert">Für Motiv und Stufe fehlen Matrixzellen.</p>
        )}
        {imageError && (
          <p role="alert">
            Mindestens eine Bildzelle konnte nicht geladen werden.
          </p>
        )}
        <div
          className="matrix"
          role="table"
          aria-label="Filter und Detailanteil"
        >
          <div role="columnheader">Filter / Detailanteil</div>
          {manifest.weights.map((weight) => (
            <div
              className={`column${weight === 1 ? " pure-reference" : ""}`}
              role="columnheader"
              key={weight}
            >
              {weight.toFixed(2).replace(".", ",")}
              {weight === 0 && <div>Triangle-Basis</div>}
              {weight === 1 && <div>Reiner Filter · 100 % Referenz</div>}
            </div>
          ))}
          {rows.map(({ kernel, cells }) => [
            <div
              className="row-label"
              role="rowheader"
              key={`${kernel.id}-label`}
            >
              {kernel.label}
            </div>,
            ...cells.map((variant, col) => {
              const refIndex = imageIndex++;
              return (
                <figure
                  role="cell"
                  key={`${kernel.id}-${manifest.weights[col]}`}
                >
                  <div
                    ref={refIndex === 0 ? firstCell : undefined}
                    className="cell"
                    data-filter-cell={`${kernel.id}-${manifest.weights[col]}`}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                  >
                    {variant && (
                      <img
                        ref={(node) => {
                          images.current[refIndex] = node;
                        }}
                        src={new URL(variant.href, manifestUrl).href}
                        alt={`${kernel.label}, Detailanteil ${variant.weight}`}
                        draggable={false}
                        onLoad={requestPan}
                        onError={() => setImageError(true)}
                        style={{
                          width: imageWidth,
                          height: imageHeight,
                          left: "50%",
                          top: "50%",
                          transform: `translate(${
                            -center.current.x * imageWidth
                          }px, ${-center.current.y * imageHeight}px)`,
                          imageRendering:
                            magnification > 1 ? "pixelated" : "auto",
                        }}
                      />
                    )}
                  </div>
                  {variant && (
                    <figcaption>
                      Kontext-RMS Δ: {variant.metrics.rmsRgb8.toFixed(2)}
                      {showContrastMetrics && (
                        <div>
                          Laplacian-RMS:{" "}
                          {variant.metrics.laplacianRmsRgb8.toFixed(2)} · lokale
                          Luma-Exkursion:{" "}
                          {variant.metrics.localLumaExcursionRgb8.toFixed(2)} /{" "}
                          {variant.metrics.localLumaExcursionPixelsPercent.toFixed(
                            1
                          )}{" "}
                          %. Kontrastindikatoren, keine Referenzwahrheit.
                        </div>
                      )}
                    </figcaption>
                  )}
                </figure>
              );
            }),
          ])}
        </div>
        <p>
          PNG16-Filterdaten aus ursprünglichem RGB8, Verarbeitung mit 16 Bit.
          Native Browserdarstellung kann 8 Bit verwenden. Kein
          AVIF-Kompressionsvergleich.
        </p>
        <p>
          RMS gilt für den gesamten 256×256-Kontext und zeigt die RGB-Differenz
          zu Triangle in RGB8-Einheiten, keine Qualitätsbewertung. Die Spalte
          0,00 enthält dieselbe Triangle-Basis für alle Zeilen.
        </p>
        <p>
          In einer Zelle ziehen verschiebt alle Bilder gemeinsam und begrenzt
          die Verschiebung auf den verfügbaren Ausschnitt.
        </p>
        {manifest.sourceInfo && <p>{manifest.sourceInfo}</p>}
      </div>
    </main>
  );
}
