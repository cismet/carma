import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ImageLevelStackPool,
  type ImagePyramidSource,
} from "./image-level-stack-pool";
import {
  ImagePyramidViewer,
  type ImagePyramidViewerProps,
} from "./ImagePyramidViewer";

export type ImagePyramidCarouselProps = Pick<
  ImagePyramidViewerProps,
  | "renderer"
  | "featherPx"
  | "foveaRadius"
  | "ringTiles"
  | "minLevelEdge"
  | "diagnostics"
> & {
  sources: readonly ImagePyramidSource[];
  /** Images kept in the pool, including parked groups. */
  poolSize?: number;
  visibleCount?: number;
  height?: number;
  fill?: boolean;
};

const BUTTON: CSSProperties = {
  background: "#273343",
  color: "inherit",
  border: "1px solid #5a6678",
  borderRadius: 4,
  padding: "4px 9px",
  font: "inherit",
  cursor: "pointer",
};
const MiB = 1024 * 1024;

/** Flip between groups of images; parked images keep a small decoded budget in the shared pool. */
export const ImagePyramidCarousel = ({
  sources,
  poolSize = 8,
  visibleCount = 4,
  height = 360,
  fill = false,
  ...viewer
}: ImagePyramidCarouselProps) => {
  const [group, setGroup] = useState(0);
  const pool = useMemo(
    () => new ImageLevelStackPool({ maxImages: poolSize }),
    [poolSize]
  );
  useEffect(() => () => pool.dispose(), [pool]);
  const readout = useRef<HTMLOutputElement>(null);
  useEffect(
    () =>
      pool.subscribe(() => {
        const metrics = pool.metrics;
        if (readout.current)
          readout.current.textContent = `Pool ${metrics.images.length}/${
            metrics.maxImages
          } Bilder · ${(metrics.decodedBytes / MiB).toFixed(
            1
          )} MiB decodiert · aktiv ${
            metrics.images.filter((image) => image.active).length
          }`;
      }),
    [pool]
  );
  const groups = Math.max(1, Math.ceil(sources.length / visibleCount));
  const shown = sources.slice(
    group * visibleCount,
    group * visibleCount + visibleCount
  );
  const columns = Math.ceil(Math.sqrt(shown.length || 1));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: fill ? "100%" : height,
        minHeight: 0,
        color: "#e8edf4",
        font: "12px system-ui, sans-serif",
      }}
    >
      <div
        style={{ display: "flex", gap: 6, alignItems: "center", padding: 6 }}
      >
        <button
          type="button"
          style={BUTTON}
          onClick={() => setGroup((group - 1 + groups) % groups)}
        >
          ◀
        </button>
        <span>
          Gruppe {group + 1}/{groups}:{" "}
          {shown.map((source) => source.id).join(", ")}
        </span>
        <button
          type="button"
          style={BUTTON}
          onClick={() => setGroup((group + 1) % groups)}
        >
          ▶
        </button>
        <output ref={readout} style={{ marginLeft: "auto" }} />
      </div>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          display: "grid",
          gap: 4,
          // minmax(0, …) keeps wide diagnostics from widening a column.
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {shown.map((source) => (
          <ImagePyramidViewer
            key={source.id}
            source={source}
            pool={pool}
            fill
            {...viewer}
          />
        ))}
      </div>
    </div>
  );
};
