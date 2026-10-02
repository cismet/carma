import { useEffect, useMemo, useRef, useState } from "react";
import { Carousel } from "antd";
import type { DevicePixels } from "@carma-units";

import type { CardinalDirection } from "../core/types";
import type {
  ObjectCoverageGroups,
  ObjectCoverageImage,
  ObjectCoverageSphere,
} from "../core/utils/object-coverage";
import { getCameraCalibration } from "../core/utils/calibration";
import type { NativePreviewWindow } from "../core/utils/native-preview-window";
import { PREVIEW_QUALITY, type PreviewQualityLevel } from "../core/constants";
import { useProgressivePreviewSource } from "./hooks/useProgressivePreviewSource";
import { getImageUrls, getPreviewImageUrl } from "./utils/imageUrls";

const DIRECTIONS: readonly Readonly<{
  direction: CardinalDirection;
  label: string;
}>[] = [
  { direction: 0, label: "N" },
  { direction: 1, label: "E" },
  { direction: 3, label: "W" },
  { direction: 2, label: "S" },
];
const EMPTY_IMAGES: readonly ObjectCoverageImage[] = [];

/** Independent source-window composition reuses the normal JPEG/TIFF worker. */
const CoveragePhoto = ({
  image,
  viewport,
  active,
  onOpen,
}: {
  image: ObjectCoverageImage;
  viewport: { width: number; height: number };
  active: boolean;
  onOpen: (imageId: string) => void;
}) => {
  const { record, dataset, crop } = image;
  const calibration = getCameraCalibration(dataset, record.cameraId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const workerSupported =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const width = Math.max(
    1,
    Math.min(viewport.width, (viewport.height * crop.width) / crop.height)
  );
  const height = (width * crop.height) / crop.width;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));
  const level = String(
    Math.min(
      6,
      Math.max(
        Number(dataset.minimumPreviewQualityLevel ?? "0"),
        Math.floor(
          Math.log2(
            Math.max(
              1,
              Math.min(crop.width / targetWidth, crop.height / targetHeight)
            )
          )
        )
      )
    )
  ) as PreviewQualityLevel;
  const { previewUrl, downloadUrl } = getImageUrls(
    record.sourceId,
    dataset.previewPath,
    level,
    undefined,
    { ...dataset, originalImageUrl: record.assets?.original?.href }
  );
  const originalUrl =
    record.assets?.original?.href ??
    (dataset.originalImageUrlTemplate ? downloadUrl : null);
  const fallback = !workerSupported || workerFailed;
  const progressiveSource = useProgressivePreviewSource({
    finalPreviewUrl: active && fallback ? previewUrl : null,
    previewPath: active && fallback ? dataset.previewPath : undefined,
    imageId: active && fallback ? record.sourceId : undefined,
  });
  // The source hook may retain a preceding image for one render after a change.
  const currentSource =
    active &&
    fallback &&
    progressiveSource &&
    Object.values(PREVIEW_QUALITY).some(
      (quality) =>
        progressiveSource ===
        getPreviewImageUrl(dataset.previewPath, quality, record.sourceId)
    )
      ? progressiveSource
      : null;

  useEffect(() => {
    if (
      !active ||
      !workerSupported ||
      !canvasRef.current ||
      !previewUrl ||
      viewport.width <= 1 ||
      viewport.height <= 1
    )
      return undefined;
    const canvas = canvasRef.current;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./utils/preview-rgb.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch {
      setWorkerFailed(true);
      return undefined;
    }
    let disposed = false;
    let generation = 0;
    let upgraded = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setWorkerFailed(false);
    setImageFailed(false);
    const nativeSize = {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    };
    const window: NativePreviewWindow = {
      source: {
        x: crop.x as DevicePixels,
        y: crop.y as DevicePixels,
        width: crop.width as DevicePixels,
        height: crop.height as DevicePixels,
      },
      target: {
        width: targetWidth as DevicePixels,
        height: targetHeight as DevicePixels,
      },
    };
    const fail = () => {
      clearTimeout(timeout);
      if (disposed) return;
      setWorkerFailed(true);
      worker.terminate();
    };
    const request = (url: string) => {
      clearTimeout(timeout);
      generation += 1;
      timeout = setTimeout(fail, 20000);
      worker.postMessage({
        url: new URL(url, globalThis.window.location.href).href,
        window,
        nativeSize,
        flipForTexture: false,
        tiff: !!originalUrl,
        generation,
        retainedSourceByteLimit: 64 * 1024 * 1024,
      });
    };
    worker.onmessage = (
      event: MessageEvent<{
        bitmap?: ImageBitmap;
        generation?: number;
        error?: string;
      }>
    ) => {
      const { bitmap } = event.data;
      if (disposed || event.data.generation !== generation) {
        bitmap?.close();
        return;
      }
      if (!bitmap || event.data.error) {
        bitmap?.close();
        fail();
        return;
      }
      clearTimeout(timeout);
      try {
        const context = canvas.getContext("2d");
        if (!context) {
          fail();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        setReady(true);
      } finally {
        bitmap.close();
      }
      if (!originalUrl && !upgraded) {
        upgraded = true;
        const lowQuality = getPreviewImageUrl(
          dataset.previewPath,
          PREVIEW_QUALITY.LEVEL_6,
          record.sourceId
        );
        if (previewUrl !== lowQuality) request(previewUrl);
      }
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    request(
      originalUrl ??
        getPreviewImageUrl(
          dataset.previewPath,
          PREVIEW_QUALITY.LEVEL_6,
          record.sourceId
        )
    );
    return () => {
      disposed = true;
      clearTimeout(timeout);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
  }, [
    active,
    workerSupported,
    previewUrl,
    originalUrl,
    dataset.previewPath,
    record.sourceId,
    calibration.widthPx,
    calibration.heightPx,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    targetWidth,
    targetHeight,
    viewport.width,
    viewport.height,
  ]);

  return (
    <div
      role="button"
      tabIndex={active ? 0 : -1}
      aria-label={`Bild ${record.sourceId} im Hauptfenster öffnen`}
      title="Doppelklick öffnet das Bild im Hauptfenster"
      onDoubleClick={() => onOpen(record.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(record.id);
        }
      }}
      style={{
        height: viewport.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-in",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>
        {currentSource && (
          <img
            src={currentSource}
            crossOrigin="anonymous"
            alt={record.sourceId}
            draggable={false}
            onError={() => setImageFailed(true)}
            onLoad={() => setImageFailed(false)}
            style={{
              position: "absolute",
              maxWidth: "none",
              width: `${(100 * calibration.widthPx) / crop.width}%`,
              height: `${(100 * calibration.heightPx) / crop.height}%`,
              left: `${(-100 * crop.x) / crop.width}%`,
              top: `${(-100 * crop.y) / crop.height}%`,
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          aria-label={`${record.sourceId} Objektausschnitt`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: ready ? 1 : 0,
          }}
        />
        {((!ready && !currentSource) || (imageFailed && !ready)) && (
          <span
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#cbd5e1",
              fontSize: 12,
            }}
          >
            {imageFailed
              ? "Vorschaubild nicht verfügbar"
              : "Vorschaubild wird geladen …"}
          </span>
        )}
      </div>
    </div>
  );
};

const CoverageQuadrant = ({
  label,
  images,
  loading,
  onOpen,
}: {
  label: string;
  images: readonly ObjectCoverageImage[];
  loading: boolean;
  onOpen: (imageId: string) => void;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [activeIndex, setActiveIndex] = useState(0);
  const token = useMemo(
    () => images.map((image) => image.record.id).join("|"),
    [images]
  );
  useEffect(() => setActiveIndex(0), [token]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const resize = () => {
      const width = Math.max(1, Math.round(element.clientWidth));
      const height = Math.max(1, Math.round(element.clientHeight));
      setViewport((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const active = images[activeIndex];
  return (
    <section
      aria-label={`Object Coverage ${label}`}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 30,
          padding: "4px 10px",
          color: "white",
          fontSize: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>{label}</strong>
        {active && (
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={active.record.sourceId}
          >
            {active.dataset.shortLabel ?? active.dataset.label} ·{" "}
            {active.record.sourceId}
          </span>
        )}
        <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          {images.length
            ? `${activeIndex + 1}/${
                images.length
              } · ${active?.pixelsPerMeter.toFixed(1)} px/m`
            : "0 Bilder"}
        </span>
      </div>
      <div
        ref={viewportRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative" }}
      >
        {images.length ? (
          <Carousel
            key={token}
            infinite={false}
            lazyLoad="ondemand"
            arrows={images.length > 1}
            dots={images.length > 1}
            beforeChange={(_, next) => setActiveIndex(next)}
          >
            {images.map((image, index) => (
              <div key={image.record.id}>
                <CoveragePhoto
                  image={image}
                  viewport={viewport}
                  active={index === activeIndex}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </Carousel>
        ) : (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: 16,
              color: "#cbd5e1",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {loading
              ? "Bildabdeckung wird ermittelt …"
              : "Kein Bild umfasst die vollständige Kugel"}
          </div>
        )}
      </div>
    </section>
  );
};

/** Four photo crops; each carousel holds only its active source composition. */
export const ObliqueObjectCoverage = ({
  sphere,
  groups,
  loading = false,
  onOpen,
  onReset,
  onCancel,
}: {
  sphere: ObjectCoverageSphere;
  groups: ObjectCoverageGroups;
  loading?: boolean;
  onOpen: (imageId: string) => void;
  onReset?: () => void;
  onCancel?: () => void;
}) => {
  const key = `${sphere.center.longitude}|${sphere.center.latitude}|${sphere.center.heightMeters}|${sphere.radiusMeters}`;
  return (
    <div
      data-test-id="oblique-object-coverage"
      data-oblique-coverage-ui="true"
      role="region"
      aria-label={`Object Coverage, Radius ${sphere.radiusMeters.toFixed(
        1
      )} Meter`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "auto",
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        gap: 4,
        padding: 4,
        background: "#e2e8f0",
      }}
    >
      {DIRECTIONS.map(({ direction, label }) => (
        <CoverageQuadrant
          key={`${direction}:${key}`}
          label={label}
          images={groups.get(direction) ?? EMPTY_IMAGES}
          loading={loading}
          onOpen={onOpen}
        />
      ))}
      {(onReset || onCancel) && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            padding: 4,
            borderRadius: 6,
            background: "white",
            boxShadow: "0 2px 8px #0004",
          }}
        >
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: 4,
                padding: "5px 10px",
                background: "#f1f5f9",
                whiteSpace: "nowrap",
              }}
            >
              Kugel neu wählen
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: 4,
                padding: "5px 10px",
                background: "#f1f5f9",
              }}
            >
              Schließen
            </button>
          )}
        </div>
      )}
    </div>
  );
};
