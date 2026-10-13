import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "antd";
import { ResizablePanel } from "@carma-commons/ui/components";
import {
  drawImageLevelReadiness,
  IMAGE_LEVEL_STATE_COLORS,
  type ImageRect,
  type ImageLevelStackPool,
  type ImageLevelStackPoolDiagnostic,
} from "@carma-commons/image-pyramid";

const megabytes = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
const LEVEL_LABELS = ["fehlt", "angefordert", "komprimiert", "decodiert"];

const ImageReadiness = ({
  image,
}: {
  image: ImageLevelStackPoolDiagnostic;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  useEffect(() => {
    if (!host.current) return;
    for (const [number, canvas] of canvases.current)
      if (!image.levels.some((level) => level.level === number)) {
        canvas.remove();
        canvases.current.delete(number);
      }
    const range = image.plan?.visibleTarget;
    const target = image.levels.find((level) => level.level === range?.level);
    const native = image.native;
    let area: ImageRect | null = null;
    if (range && target && native) {
      const tileWidth = target.tileWidth ?? target.width / target.cols;
      const tileHeight = target.tileHeight ?? target.height / target.rows;
      const x = range.col0 * tileWidth;
      const y = range.row0 * tileHeight;
      area = {
        x: (x / target.width) * native.width,
        y: (y / target.height) * native.height,
        width:
          ((Math.min(target.width, range.col1 * tileWidth) - x) /
            target.width) *
          native.width,
        height:
          ((Math.min(target.height, range.row1 * tileHeight) - y) /
            target.height) *
          native.height,
      } as ImageRect;
    }
    for (const level of image.levels) {
      drawImageLevelReadiness(
        host.current,
        canvases.current,
        level,
        image.plan,
        area,
        image.native
      );
      const canvas = canvases.current.get(level.level)!;
      Object.assign(canvas.style, {
        borderRadius: "0",
        height: "64px",
        width: "auto",
      });
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", canvas.title);
    }
  }, [image]);
  const { metrics } = image;
  const status = image.error
    ? "Fehler"
    : image.active
    ? "Aktiv"
    : image.prewarming
    ? "Vorbereitung"
    : "Geparkt";
  const details = [
    `${image.source.id} · ${status}`,
    `${image.source.kind.toUpperCase()} · ${
      metrics.target === null
        ? "Metadaten"
        : `L${metrics.target} ${metrics.visibleReady ? "bereit" : "lädt"}`
    } · ${metrics.fetching} Fetch / ${metrics.decoding} Decode`,
    `${megabytes(metrics.decodedBytes)} Pixel / ${megabytes(
      metrics.budgetBytes
    )} Budget`,
    `${megabytes(metrics.compressedBytes)} kompr. · ${
      metrics.decodedTiles
    } Kacheln · ${metrics.requests} Requests`,
  ];
  return (
    <li
      title={[...details, image.error].filter(Boolean).join("\n")}
      style={{
        position: "relative",
        height: 66,
        padding: 0,
        borderBottom: "1px solid #64748b",
        background: "#303844",
        overflow: "hidden",
      }}
    >
      <div
        ref={host}
        style={{
          display: "flex",
          gap: 0,
          height: "100%",
          alignItems: "flex-start",
          overflowX: "auto",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "14px 3px 0",
          pointerEvents: "none",
          color: "white",
          textShadow: "0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000",
          fontSize: 11,
          lineHeight: "12px",
        }}
      >
        {details.map((line, index) => (
          <div
            key={index}
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </li>
  );
};

/** Passive diagnostics: mounting never acquires sources or requests pixels. */
export const ObliquePoolDebug = ({
  pool,
  onClose,
}: {
  pool: ImageLevelStackPool;
  onClose: () => void;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<
    readonly ImageLevelStackPoolDiagnostic[]
  >([]);
  const [position, setPosition] = useState({ x: 16, y: 80 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const clamp = useCallback((point: { x: number; y: number }) => {
    const element = root.current;
    const parent = element?.parentElement;
    if (!element || !parent) return point;
    const next = {
      x: Math.max(
        0,
        Math.min(point.x, parent.clientWidth - element.offsetWidth)
      ),
      y: Math.max(
        0,
        Math.min(point.y, parent.clientHeight - element.offsetHeight)
      ),
    };
    return next.x === point.x && next.y === point.y ? point : next;
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      timer = undefined;
      if (!disposed) setImages(pool.diagnostics());
    };
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(update, 200);
    };
    const unsubscribe = pool.subscribe(schedule);
    update();
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [pool]);
  useEffect(() => {
    const element = root.current;
    const parent = element?.parentElement;
    const owner = element?.ownerDocument.defaultView as
      | (Window & typeof globalThis)
      | null
      | undefined;
    const resize = () => setPosition((point) => clamp(point));
    const observer = owner?.ResizeObserver
      ? new owner.ResizeObserver(resize)
      : undefined;
    if (parent) observer?.observe(parent);
    if (element) observer?.observe(element);
    owner?.addEventListener("resize", resize);
    resize();
    return () => {
      observer?.disconnect();
      owner?.removeEventListener("resize", resize);
    };
  }, [clamp]);
  useEffect(() => setPosition((point) => clamp(point)), [clamp, images.length]);
  return (
    <ResizablePanel
      ref={root}
      role="dialog"
      aria-label="Native-Bildpool"
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        zIndex: 20,
        width: "fit-content",
        minWidth: "min(240px, calc(100% - 16px))",
        maxWidth: "calc(100% - 16px)",
        maxHeight: "calc(100% - 16px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 100,
        pointerEvents: "auto",
        background: "#fff",
        color: "#1f2937",
        border: "1px solid #cbd5e1",
        borderRadius: 0,
        boxShadow: "0 4px 16px #0003",
        fontSize: 12,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 8px",
          flex: "0 0 auto",
          borderBottom: "1px solid #e5e7eb",
          cursor: "move",
          userSelect: "none",
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          drag.current = {
            pointerId: event.pointerId,
            x: position.x,
            y: position.y,
            startX: event.clientX,
            startY: event.clientY,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const held = drag.current;
          if (!held || held.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          setPosition(
            clamp({
              x: held.x + event.clientX - held.startX,
              y: held.y + event.clientY - held.startY,
            })
          );
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <FontAwesomeIcon icon={faGripVertical} aria-hidden />
        <strong style={{ flex: 1 }}>
          Native-Bildpool · {images.length} Bilder
        </strong>
        <Button
          type="text"
          size="small"
          aria-label="Bildpool-Diagnose schließen"
          onClick={onClose}
          icon={<FontAwesomeIcon icon={faXmark} />}
        />
      </div>
      <div
        title="Aktive Fotos und vorbereitete Ansichten; separater Hover-L6-Cache nicht enthalten. Zielstufe: blauer Rahmen. Zielkachelbereich: weiß. Stufendetails per Mauszeiger."
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: "2px 4px",
          flex: "0 0 auto",
          color: "#475569",
          fontSize: 10,
        }}
      >
        {LEVEL_LABELS.map((label, index) => (
          <span key={label}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                background: IMAGE_LEVEL_STATE_COLORS[index],
                marginRight: 3,
              }}
            />
            {label}
          </span>
        ))}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          overflowY: "auto",
          overscrollBehavior: "contain",
          minHeight: 0,
          minWidth: 0,
          flex: "1 1 auto",
        }}
      >
        {images.map((image) => (
          <ImageReadiness
            key={`${image.source.kind}:${image.source.url}`}
            image={image}
          />
        ))}
        {!images.length && (
          <li style={{ padding: 10 }}>Keine Bilder im Native-Pool.</li>
        )}
      </ul>
    </ResizablePanel>
  );
};
