import { useEffect, useRef, useState, type PointerEvent } from "react";

type Variant = {
  id: string;
  label: string;
  role: string;
  primaryBytes: number;
  wholeBytes: number | null;
};
type Roi = {
  id: string;
  label: string;
  width: number;
  height: number;
  bounds: number[];
  images: Record<string, string>;
  metrics: Record<
    string,
    { approved: number; vendor: number; advantage: number }
  >;
};
type Manifest = {
  schemaVersion: number;
  variants: Variant[];
  rois: Roi[];
  vendorL1JpegBytes: number;
  maxWholeBytes: number;
  scope: string;
  precision: string;
};
export type QualitySettingsComparisonProps = {
  manifestUrl: string;
  motif?: string;
  comparison?: string;
  magnification?: number;
  onMotifChange?: (value: string) => void;
  onComparisonChange?: (value: string) => void;
  onMagnificationChange?: (value: number) => void;
};
const bytes = (value: number | null) =>
  value === null ? "nicht gemessen" : `${(value / 1e6).toFixed(2)} MB`;

export default function QualitySettingsComparison({
  manifestUrl,
  motif = "facade",
  comparison = "q90",
  magnification = 1,
  onMotifChange,
  onComparisonChange,
  onMagnificationChange,
}: QualitySettingsComparisonProps) {
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [error, setError] = useState<string | null>(null),
    [blind, setBlind] = useState(false),
    [revealed, setRevealed] = useState(false),
    [swapped, setSwapped] = useState(false),
    [vote, setVote] = useState<string | null>(null);
  const [dpr, setDpr] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  );
  const images = useRef<(HTMLImageElement | null)[]>([]),
    cells = useRef<(HTMLDivElement | null)[]>([]),
    sizes = useRef<{ width: number; height: number }[]>([]),
    center = useRef({ x: 0.5, y: 0.5 }),
    wanted = useRef(center.current),
    frame = useRef<number | null>(null),
    drag = useRef<{
      x: number;
      y: number;
      center: { x: number; y: number };
    } | null>(null);
  const roi =
      manifest?.rois.find((item) => item.id === motif) ?? manifest?.rois[0],
    old = manifest?.variants.find((item) => item.id === "q96"),
    next =
      manifest?.variants.find((item) => item.id === comparison) ??
      manifest?.variants.find((item) => item.id === "q90");
  const geometry = useRef({ width: 512, height: 512, magnification, dpr });
  geometry.current = {
    width: roi?.width ?? 512,
    height: roi?.height ?? 512,
    magnification,
    dpr,
  };
  const apply = () => {
    const g = geometry.current,
      w = (g.width * g.magnification) / g.dpr,
      h = (g.height * g.magnification) / g.dpr;
    let minX = 0,
      minY = 0;
    for (const size of sizes.current) {
      minX = Math.max(minX, Math.min(0.5, size.width / (2 * w)));
      minY = Math.max(minY, Math.min(0.5, size.height / (2 * h)));
    }
    center.current = {
      x: Math.max(minX, Math.min(1 - minX, wanted.current.x)),
      y: Math.max(minY, Math.min(1 - minY, wanted.current.y)),
    };
    for (const image of images.current)
      if (image)
        image.style.transform = `translate(${-center.current.x * w}px, ${
          -center.current.y * h
        }px)`;
  };
  const schedule = () => {
    if (frame.current === null)
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
          throw Error("Vergleichsbilder konnten nicht geladen werden.");
        const data = (await response.json()) as Manifest;
        if (
          !Array.isArray(data.rois) ||
          !Array.isArray(data.variants) ||
          !data.rois.length ||
          data.rois.some((r) => !r.images || !r.width || !r.height)
        )
          throw Error("Vergleichsmanifest ist unvollständig.");
        setManifest(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Vergleich konnte nicht geladen werden."
          );
      });
    return () => controller.abort();
  }, [manifestUrl]);
  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      sizes.current = cells.current.map((cell) => ({
        width: cell?.clientWidth ?? 0,
        height: cell?.clientHeight ?? 0,
      }));
      schedule();
    });
    for (const cell of cells.current) if (cell) observer.observe(cell);
    sizes.current = cells.current.map((cell) => ({
      width: cell?.clientWidth ?? 0,
      height: cell?.clientHeight ?? 0,
    }));
    schedule();
    return () => observer.disconnect();
  }, [manifest, roi?.id]);
  useEffect(() => {
    wanted.current = { x: 0.5, y: 0.5 };
    setVote(null);
    setRevealed(false);
    schedule();
  }, [roi?.id, comparison]);
  useEffect(() => {
    schedule();
  }, [magnification, dpr, swapped]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );
  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      center: center.current,
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const g = geometry.current;
    wanted.current = {
      x:
        drag.current.center.x -
        (event.clientX - drag.current.x) /
          ((g.width * g.magnification) / g.dpr),
      y:
        drag.current.center.y -
        (event.clientY - drag.current.y) /
          ((g.height * g.magnification) / g.dpr),
    };
    schedule();
  };
  const choose = (value: string) => {
    setVote(value);
    setRevealed(true);
    try {
      const key = "oblique-quality-local-votes",
        previous = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
      localStorage.setItem(
        key,
        JSON.stringify(
          [
            ...previous,
            {
              roi: roi?.id,
              comparison,
              swapped,
              preference: value,
              at: new Date().toISOString(),
            },
          ].slice(-100)
        )
      );
    } catch {
      /* A private-browser storage failure does not block comparison. */
    }
  };
  if (error) return <p role="alert">{error}</p>;
  if (!manifest || !roi || !old || !next)
    return <p role="status">Vergleich wird geladen …</p>;
  const hidden = blind && !revealed,
    pair = swapped ? [next, old] : [old, next],
    imageWidth = (roi.width * magnification) / dpr,
    imageHeight = (roi.height * magnification) / dpr;
  return (
    <section
      style={{
        maxWidth: 1240,
        margin: "0 auto",
        padding: 16,
        color: "#e8eef7",
        background: "#141a23",
        minHeight: "100vh",
        boxSizing: "border-box",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 23, margin: "0 0 12px" }}>
        AVIF-Qualität: bisher q96 und neue Kandidaten
      </h1>
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label>
          Ausschnitt{" "}
          <select
            value={roi.id}
            onChange={(event) => onMotifChange?.(event.target.value)}
          >
            {manifest.rois.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!hidden && (
          <label>
            Vergleich{" "}
            <select
              value={next.id}
              onChange={(event) => onComparisonChange?.(event.target.value)}
            >
              {manifest.variants
                .filter((item) => item.id !== "q96")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Pixelansicht{" "}
          <select
            value={magnification}
            onChange={(event) =>
              onMagnificationChange?.(Number(event.target.value))
            }
          >
            {[1, 2, 4, 8].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={blind}
            onChange={(event) => {
              setBlind(event.target.checked);
              setSwapped(event.target.checked && Math.random() > 0.5);
              setVote(null);
              setRevealed(false);
            }}
          />{" "}
          A/B ohne Metadaten
        </label>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 13 }}>
        Gleiche 512-Pixel-Ausschnitte, synchron verschiebbar. 1× entspricht
        einem Quellpixel pro physischem Displaypixel; größere Stufen dienen der
        Inspektion.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 12,
        }}
      >
        {pair.map((variant, index) => (
          <figure key={variant.id} style={{ margin: 0, minWidth: 0 }}>
            <figcaption
              style={{
                padding: "8px 0",
                minHeight: hidden ? 28 : 74,
                fontSize: 14,
              }}
            >
              <strong>
                {hidden ? String.fromCharCode(65 + index) : variant.label}
              </strong>
              {!hidden && (
                <>
                  <div>
                    L1: {bytes(variant.primaryBytes)} · L1–L8:{" "}
                    {bytes(variant.wholeBytes)}
                  </div>
                  <div style={{ fontSize: 12, color: "#bbc9da" }}>
                    {variant.role === "production-old"
                      ? "Bisheriger q96-Preset; Produktion bleibt unverändert."
                      : "Explorativer Kandidat; keine Produktionsumstellung."}
                  </div>
                </>
              )}
            </figcaption>
            <div
              ref={(element) => {
                cells.current[index] = element;
              }}
              data-test-id={`quality-settings-cell-${index}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                overflow: "hidden",
                background: "#080c12",
                cursor: "grab",
                touchAction: "none",
                border: "1px solid #526075",
                boxSizing: "border-box",
              }}
            >
              <img
                ref={(element) => {
                  images.current[index] = element;
                }}
                src={new URL(roi.images[variant.id], manifestUrl).href}
                alt={
                  hidden
                    ? `Ausschnitt ${String.fromCharCode(65 + index)}`
                    : `${roi.label}, ${variant.label}`
                }
                onLoad={schedule}
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: imageWidth,
                  height: imageHeight,
                  maxWidth: "none",
                  userSelect: "none",
                }}
              />
            </div>
            {!hidden && (
              <p style={{ fontSize: 12 }}>
                SSIMULACRA2 zum Mitchell-Ziel:{" "}
                {roi.metrics[variant.id]?.approved.toFixed(3)} · Vorteil
                gegenüber Vendor am selben Ziel:{" "}
                {roi.metrics[variant.id]?.advantage.toFixed(3)}
              </p>
            )}
          </figure>
        ))}
      </div>
      {blind && !revealed && (
        <p>
          A/B-Vorliebe: <button onClick={() => choose("A")}>A</button>{" "}
          <button onClick={() => choose("equal")}>gleich</button>{" "}
          <button onClick={() => choose("B")}>B</button> – Auswahl deckt
          Metadaten auf; bleibt nur lokal gespeichert.
        </p>
      )}
      {vote && <p>Lokale Auswahl: {vote}.</p>}
      {!hidden && (
        <details style={{ marginTop: 12 }}>
          <summary>Größenregel, Referenz und Präzision</summary>
          <p>
            Vendor-JPEG-L1: {bytes(manifest.vendorL1JpegBytes)}. Explorative
            Whole-L1–L8-Grenze (+10%): {bytes(manifest.maxWholeBytes)}. q90
            liegt darin; q96 bleibt der bisherige Produktionspreset.
          </p>
          <p>{manifest.scope}</p>
          <p>{manifest.precision}</p>
          <p>
            Die Zahlen bewerten Übereinstimmung mit der gewählten
            Mitchell-Referenz, keine physikalische Ground Truth. Fünf
            ausgewählte ROIs ergeben keine vollständige Dataset-Freigabe.
          </p>
        </details>
      )}
    </section>
  );
}
