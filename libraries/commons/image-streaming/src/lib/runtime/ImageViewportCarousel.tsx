import { useEffect, useMemo, useRef, useState } from "react";
import { ImageViewportViewer } from "./ImageViewportViewer";
import {
  ImageViewportPool,
  type ImageViewportSource,
} from "./image-viewport-pool";

export type ImageViewportCarouselProps = {
  sources: readonly ImageViewportSource[];
  poolSize?: number;
  visibleCount?: number;
  height?: number;
  zoom?: number;
  /** Fill a height-constrained parent with a grid below the carousel controls. */
  fill?: boolean;
};

/** Image-only gallery composition using the shared bounded reader pool. */
export const ImageViewportCarousel = ({
  sources,
  poolSize = 8,
  visibleCount = 4,
  height = 360,
  zoom = 1,
  fill = false,
}: ImageViewportCarouselProps) => {
  const [index, setIndex] = useState(0);
  const pool = useMemo(
    () => new ImageViewportPool({ maxImages: poolSize }),
    [poolSize]
  );
  const retired = useRef(
    new Map<ImageViewportPool, ReturnType<typeof setTimeout>>()
  );
  const thumbnails = useRef(
    new Map<string, { canvas: HTMLCanvasElement; bitmap: ImageBitmap | null }>()
  );
  useEffect(() => {
    clearTimeout(retired.current.get(pool));
    retired.current.delete(pool);
    return () => {
      retired.current.set(
        pool,
        setTimeout(() => {
          pool.dispose();
          retired.current.delete(pool);
        }, 0)
      );
    };
  }, [pool]);
  useEffect(() => {
    const draw = () => {
      for (const source of sources) {
        const thumbnail = thumbnails.current.get(source.id),
          image = pool.peek(source)?.bitmap;
        if (!thumbnail || !image || thumbnail.bitmap === image) continue;
        const context = thumbnail.canvas.getContext("2d");
        if (!context) continue;
        const scale = Math.min(
          thumbnail.canvas.width / image.width,
          thumbnail.canvas.height / image.height
        );
        context.clearRect(
          0,
          0,
          thumbnail.canvas.width,
          thumbnail.canvas.height
        );
        context.drawImage(
          image,
          (thumbnail.canvas.width - image.width * scale) / 2,
          (thumbnail.canvas.height - image.height * scale) / 2,
          image.width * scale,
          image.height * scale
        );
        thumbnail.bitmap = image;
      }
    };
    draw();
    return pool.subscribe(draw);
  }, [pool, sources]);
  const count = Math.min(sources.length, Math.max(1, visibleCount));
  const columns = count > 1 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(count / columns));
  const start = sources.length ? index % sources.length : 0;
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        height: fill ? "100%" : undefined,
        minHeight: fill ? 0 : undefined,
        display: fill ? "flex" : undefined,
        flexDirection: fill ? "column" : undefined,
      }}
    >
      <nav
        aria-label="Bildkarussell"
        style={{
          display: "flex",
          flexWrap: "wrap",
          flexShrink: 0,
          gap: 6,
          padding: 8,
        }}
      >
        <button
          disabled={!sources.length}
          onClick={() =>
            setIndex(
              (value) => (value - count + sources.length) % sources.length
            )
          }
        >
          Zurück
        </button>
        {sources.map((source, item) => (
          <button
            key={source.id}
            aria-pressed={item === start}
            onClick={() => setIndex(item)}
            style={{ display: "grid", gap: 3 }}
          >
            <canvas
              width={80}
              height={60}
              aria-hidden="true"
              style={{ background: "#303844" }}
              ref={(canvas) => {
                if (canvas)
                  thumbnails.current.set(source.id, { canvas, bitmap: null });
                else thumbnails.current.delete(source.id);
              }}
            />
            {source.id}
          </button>
        ))}
        <button
          disabled={!sources.length}
          onClick={() => setIndex((value) => (value + count) % sources.length)}
        >
          Weiter
        </button>
      </nav>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: fill
            ? `repeat(${rows}, minmax(0, 1fr))`
            : undefined,
          flex: fill ? "1 1 0" : undefined,
          minHeight: 0,
          minWidth: 0,
          gap: 8,
        }}
      >
        {Array.from(
          { length: count },
          (_, offset) => sources[(start + offset) % sources.length]
        ).map((source) => (
          <ImageViewportViewer
            key={source.id}
            source={source}
            pool={pool}
            height={height}
            fill={fill}
            zoom={zoom}
          />
        ))}
      </div>
    </div>
  );
};
