import { useEffect, useRef, useState, type PointerEvent } from "react";

type SampleTile = {
  motif: string;
  level: string;
  width: number;
  height: number;
  href: string;
  referenceHref: string;
  bytes: number;
  referenceBytes: number;
  q: number;
  ssimulacra2: number;
  sourceWindowL0: [number, number, number, number];
  targetL0: [number, number];
  sourcePhoto: string;
};
type SampleManifest = {
  schemaVersion: number;
  watermark: { position: "top-left" | "top-right" };
  profile: {
    id: string;
    filter: string;
    B: number;
    C: number;
    inputColourSpace: string;
    workingColourSpace: string;
    outputColourSpace: string;
    workingPrecision: string;
    workingStorageBitDepth: number;
    nativeSourceRgbBitDepth: number;
    codec: string;
    sampleDepth: number;
    chroma: string;
    encoderSpeed: number;
    independentLevelsFrom: "unstamped uncompressed L1";
    triangleBlend: boolean;
    unsharp: boolean;
    contrastAdjustment: boolean;
  };
  motifs: { id: string; label: string }[];
  levels: string[];
  tiles: SampleTile[];
  scope?: string;
};
export type BestPracticeTilesProps = {
  manifestUrl: string;
  motif: string;
  magnification: number;
  onMotifChange?: (motif: string) => void;
};

export default function BestPracticeTiles({
  manifestUrl,
  motif,
  magnification,
  onMotifChange,
}: BestPracticeTilesProps) {
  const [manifest, setManifest] = useState<SampleManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const cellSizes = useRef<{ width: number; height: number }[]>([]);
  const center = useRef({ x: 0.5, y: 0.5 });
  const wanted = useRef(center.current);
  const geometry = useRef({ magnification, dpr, width: 512, height: 512 });
  const frame = useRef<number | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    center: { x: number; y: number };
  } | null>(null);
  const apply = () => {
    const g = geometry.current,
      width = (g.width * g.magnification) / g.dpr,
      height = (g.height * g.magnification) / g.dpr;
    let minX = 0,
      minY = 0;
    for (const size of cellSizes.current) {
      if (!size) continue;
      minX = Math.max(minX, Math.min(0.5, size.width / (2 * width)));
      minY = Math.max(minY, Math.min(0.5, size.height / (2 * height)));
    }
    wanted.current = {
      x: Math.max(0, Math.min(1, wanted.current.x)),
      y: Math.max(0, Math.min(1, wanted.current.y)),
    };
    center.current = {
      x: Math.max(minX, Math.min(1 - minX, wanted.current.x)),
      y: Math.max(minY, Math.min(1 - minY, wanted.current.y)),
    };
    for (const image of images.current)
      if (image)
        image.style.transform = `translate(${-center.current.x * width}px, ${
          -center.current.y * height
        }px)`;
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
          throw Error("Beispielkacheln konnten nicht geladen werden.");
        const data = (await response.json()) as SampleManifest;
        if (
          !Array.isArray(data.tiles) ||
          !Array.isArray(data.levels) ||
          !Array.isArray(data.motifs) ||
          !data.watermark ||
          !["top-left", "top-right"].includes(data.watermark.position)
        )
          throw Error("Kachelmanifest ist unvollständig.");
        setManifest(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Beispielkacheln konnten nicht geladen werden."
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
  const tiles =
    manifest?.levels.map((level) =>
      manifest.tiles.find(
        (tile) => tile.motif === motif && tile.level === level
      )
    ) ?? [];
  geometry.current = {
    magnification,
    dpr,
    width: tiles[0]?.width ?? 512,
    height: tiles[0]?.height ?? 512,
  };
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const index = cells.current.indexOf(entry.target as HTMLDivElement);
        if (index >= 0)
          cellSizes.current[index] = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          };
      }
      requestPan();
    });
    for (const node of cells.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [manifest, motif]);
  useEffect(() => {
    wanted.current = { x: 0.5, y: 0.5 };
    drag.current = null;
    setImageError(false);
    requestPan();
  }, [manifest, motif]);
  useEffect(() => {
    requestPan();
  }, [magnification, dpr]);
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
    requestPan();
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
        <p>Beispielkacheln werden geladen …</p>
      </main>
    );
  return (
    <main className="best-practice-tiles">
      <style>{`
      .best-practice-tiles {font:15px/1.45 system-ui,sans-serif;background:#f7f7f5;color:#202020;min-height:100vh;}
      .best-practice-tiles * {box-sizing:border-box;}
      .best-practice-tiles .content {width:100%;max-width:1450px;margin:auto;padding:12px 16px;}
      .best-practice-tiles header {position:sticky;top:0;background:#f7f7f5;border-bottom:1px solid #bbb;z-index:2;}
      .best-practice-tiles h1 {font-size:22px;margin:0 0 6px;}
      .best-practice-tiles p {margin:6px 0;}
      .best-practice-tiles .controls {display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
      .best-practice-tiles button,.best-practice-tiles select {font:inherit;min-height:38px;padding:5px 12px;border:1px solid #666;background:#fff;}
      .best-practice-tiles .panes {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}
      .best-practice-tiles figure {margin:0;min-width:0;}
      .best-practice-tiles h2 {font-size:18px;margin:0 0 6px;}
      .best-practice-tiles .cell {width:100%;aspect-ratio:1;position:relative;overflow:hidden;background:#181818;touch-action:none;cursor:grab;}
      .best-practice-tiles img {position:absolute;max-width:none;display:block;user-select:none;pointer-events:none;}
      .best-practice-tiles figcaption {font-size:13px;padding-top:7px;}
      .best-practice-tiles a {display:inline-block;margin-top:6px;color:#164b83;}
      @media(max-width:1000px){.best-practice-tiles .panes {grid-template-columns:repeat(2,minmax(0,1fr));}}
    `}</style>
      <header>
        <div className="content">
          <h1>Best-Practice-Luftbildkacheln L1–L4</h1>
          <p>
            {manifest.profile.filter} · B=
            {manifest.profile.B === 1 / 3 ? "1/3" : manifest.profile.B}, C=
            {manifest.profile.C === 1 / 3 ? "1/3" : manifest.profile.C} ·{" "}
            {manifest.profile.workingColourSpace} ·{" "}
            {manifest.profile.workingPrecision} · {manifest.profile.codec}{" "}
            {manifest.profile.sampleDepth} Bit{" "}
            {manifest.profile.chroma === "444"
              ? "4:4:4"
              : manifest.profile.chroma}{" "}
            · Encoder-Speed {manifest.profile.encoderSpeed}
          </p>
          <div className="controls">
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
            <span>{magnification}× · gleiche physische Bildpixelskala</span>
            <button
              onClick={() => {
                wanted.current = { x: 0.5, y: 0.5 };
                requestPan();
              }}
            >
              Alle Kacheln zentrieren
            </button>
          </div>
        </div>
      </header>
      <div className="content">
        {imageError && (
          <p role="alert">
            Mindestens eine Kachel konnte nicht geladen werden.
          </p>
        )}
        <div className="panes">
          {tiles.map((tile, index) => (
            <figure key={manifest.levels[index]}>
              <h2>
                {manifest.levels[index]}
                {manifest.levels[index] === "L2" ? " · Detailansicht" : ""}
              </h2>
              <div
                ref={(node) => {
                  cells.current[index] = node;
                }}
                className="cell"
                data-best-practice-cell={manifest.levels[index]}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                {tile && (
                  <img
                    ref={(node) => {
                      images.current[index] = node;
                    }}
                    src={new URL(tile.href, manifestUrl).href}
                    alt={`${
                      manifest.motifs.find((value) => value.id === motif)
                        ?.label ?? motif
                    }, ${tile.level}`}
                    draggable={false}
                    onLoad={requestPan}
                    onError={() => setImageError(true)}
                    style={{
                      width: (tile.width * magnification) / dpr,
                      height: (tile.height * magnification) / dpr,
                      left: "50%",
                      top: "50%",
                      transform: `translate(${
                        (-center.current.x * tile.width * magnification) / dpr
                      }px, ${
                        (-center.current.y * tile.height * magnification) / dpr
                      }px)`,
                      imageRendering: magnification > 1 ? "pixelated" : "auto",
                    }}
                  />
                )}
              </div>
              {tile ? (
                <figcaption>
                  512×512 · AVIF 10 Bit 4:4:4 · {(tile.bytes / 1024).toFixed(1)}{" "}
                  KiB · Q {tile.q} · SSIMULACRA2 {tile.ssimulacra2.toFixed(2)}
                  <br />
                  <a
                    href={new URL(tile.referenceHref, manifestUrl).href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PNG16-Referenz öffnen (
                    {(tile.referenceBytes / 1024).toFixed(1)} KiB)
                  </a>
                </figcaption>
              ) : (
                <p role="alert">Kachel fehlt.</p>
              )}
            </figure>
          ))}
        </div>
        <p>
          Die vier Stufen zeigen unterschiedlich große Gebietsausdehnungen.
          Gemeinsames Ziehen folgt der normalisierten Kachelposition; jede
          Ansicht bleibt auf ihren Bildausschnitt begrenzt.
        </p>
        <p>
          L2–L4 entstehen jeweils unabhängig aus der unbeschrifteten,
          unkomprimierten L1-Basis. Der Herkunftshinweis wird hier je
          Beispielkachel{" "}
          {manifest.watermark.position === "top-left"
            ? "oben links"
            : "oben rechts"}{" "}
          angebracht; beim Gesamtlevel-Export steht er einmal am Gesamtbild.
        </p>
        <p>
          Eingang und Ausgabe: {manifest.profile.inputColourSpace}/
          {manifest.profile.outputColourSpace}; ursprüngliches RGB:{" "}
          {manifest.profile.nativeSourceRgbBitDepth} Bit; Arbeitsablage:{" "}
          {manifest.profile.workingStorageBitDepth} Bit bei{" "}
          {manifest.profile.workingPrecision}.
        </p>
        <p>
          20 Beispielkacheln aus einer Luftaufnahme von 2026. Die
          Qualitätsschwelle 94 gilt für die jeweilige 512-Pixel-Kachel und
          bestätigt keine vollständige Fotobewertung. Native Browserdarstellung
          kann trotz 10-Bit-Eingabe mit 8 Bit erfolgen.
        </p>
      </div>
    </main>
  );
}
