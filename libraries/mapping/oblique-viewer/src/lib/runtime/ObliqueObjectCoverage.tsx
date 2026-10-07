import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Carousel, Tooltip } from "antd";
import type { CarouselRef } from "antd/es/carousel";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Raycaster, Vector3, Vector4, type Mesh } from "three";
import type { DevicePixels } from "@carma-units";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";

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
import { usePrefetchedPreviewThumbnail } from "./hooks/usePrefetchedPreviewThumbnail";
import { getImageUrls, getPreviewImageUrl } from "./utils/imageUrls";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "./utils/image-projection";

import type { createPhotoAxisPicker } from "./utils/photo-axis-picker";

const DIRECTIONS: readonly { direction: CardinalDirection; label: string }[] = [
  { direction: 0, label: "N" },
  { direction: 1, label: "O" },
  { direction: 3, label: "W" },
  { direction: 2, label: "S" },
];
const EMPTY_IMAGES: readonly ObjectCoverageImage[] = [];

/** Keep the sphere in view, expand to the cell aspect, and cap physical-pixel magnification at 3x. */
const coverageWindow = (
  image: ObjectCoverageImage,
  viewport: { width: number; height: number }
) => {
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const pixelRatio = globalThis.devicePixelRatio || 1;
  const aspect = Math.max(1, viewport.width) / Math.max(1, viewport.height);
  const height = Math.max(
    image.crop.height,
    image.crop.width / aspect,
    (viewport.height * pixelRatio) / 3
  );
  const width = height * aspect;
  const crop = {
    x: image.crop.x + (image.crop.width - width) / 2,
    y: image.crop.y + (image.crop.height - height) / 2,
    width,
    height,
  };
  // Virtual crop outside the sensor stays empty, rather than stretching or clipping the object.
  const x = Math.max(0, Math.floor(crop.x)),
    y = Math.max(0, Math.floor(crop.y));
  const right = Math.min(calibration.widthPx, Math.ceil(crop.x + crop.width));
  const bottom = Math.min(
    calibration.heightPx,
    Math.ceil(crop.y + crop.height)
  );
  const source = {
    x: x as DevicePixels,
    y: y as DevicePixels,
    width: Math.max(1, right - x) as DevicePixels,
    height: Math.max(1, bottom - y) as DevicePixels,
  };
  const window: NativePreviewWindow = {
    source,
    target: {
      width: Math.max(
        1,
        Math.round((viewport.width * pixelRatio * source.width) / width)
      ) as DevicePixels,
      height: Math.max(
        1,
        Math.round((viewport.height * pixelRatio * source.height) / height)
      ) as DevicePixels,
    },
  };
  return { calibration, crop, window, pixelRatio };
};

const originalOf = (image: ObjectCoverageImage) =>
  image.dataset.avifOnly
    ? undefined
    : image.record.assets?.original?.href ??
      image.dataset.originalImageUrlTemplate?.replace(
        /\{imageId\}/g,
        encodeURIComponent(image.record.sourceId)
      );

const pyramidOf = (image: ObjectCoverageImage) =>
  image.record.assets?.pyramid?.href ??
  image.dataset.avifPyramidTemplate?.replace(
    /\{imageId\}/g,
    encodeURIComponent(image.record.sourceId)
  );

const CoverageThumbnail = ({ image }: { image: ObjectCoverageImage }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const thumbnail = usePrefetchedPreviewThumbnail(
    image.dataset.previewPath,
    image.record.sourceId,
    !visible,
    {
      avifOnly: image.dataset.avifOnly,
      originalImageUrl: originalOf(image),
      avifPyramidUrl: pyramidOf(image)
        ? new URL(pyramidOf(image)!, globalThis.window.location.href).href
        : undefined,
      nativeSize: { width: calibration.widthPx, height: calibration.heightPx },
      enqueue: true,
    }
  );
  return (
    <span
      ref={ref}
      style={{ display: "block", width: 56, height: 40, background: "#334155" }}
    >
      {thumbnail ? (
        <img
          src={thumbnail.blobUrl}
          alt={image.record.sourceId}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            color: "#cbd5e1",
          }}
        >
          ▧
        </span>
      )}
    </span>
  );
};

/** One low-priority source-window job at a time warms alternatives at display resolution. */
const CoveragePreload = ({
  images,
  viewport,
  enabled,
}: {
  images: readonly ObjectCoverageImage[];
  viewport: { width: number; height: number };
  enabled: boolean;
}) => {
  useEffect(() => {
    if (
      !enabled ||
      viewport.width <= 1 ||
      viewport.height <= 1 ||
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined"
    )
      return;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./utils/preview-rgb.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch {
      return;
    }
    let disposed = false,
      index = 0,
      generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      clearTimeout(timer);
      // Keep the idle bounded worker alive so outstanding cache writes can finish.
      if (disposed || index >= images.length) return;
      const image = images[index++];
      const { calibration, window } = coverageWindow(image, viewport);
      const original = originalOf(image);
      const url =
        original ??
        getPreviewImageUrl(
          image.dataset.previewPath,
          image.dataset.minimumPreviewQualityLevel ?? "0",
          image.record.sourceId
        );
      worker.postMessage({
        url: new URL(url, globalThis.window.location.href).href,
        window,
        nativeSize: {
          width: calibration.widthPx,
          height: calibration.heightPx,
        },
        avifOnly: image.dataset.avifOnly,
        tiff: !!original,
        avifPyramidUrl: pyramidOf(image)
          ? new URL(pyramidOf(image)!, globalThis.window.location.href).href
          : undefined,
        flipForTexture: false,
        generation: ++generation,
        minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
        maxInitialDisplayPixelSize: 1,
        refineToNative: false,
        retainedSourceByteLimit: 32 * 1024 * 1024,
        priority: "low",
      });
      timer = setTimeout(next, 20000);
    };
    worker.onmessage = (
      event: MessageEvent<{
        bitmap?: ImageBitmap;
        generation?: number;
        complete?: boolean;
        error?: string;
      }>
    ) => {
      event.data.bitmap?.close();
      if (
        !disposed &&
        event.data.generation === generation &&
        (event.data.complete || event.data.error)
      ) {
        clearTimeout(timer);
        timer = setTimeout(next, 0);
      }
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    timer = setTimeout(next, 0);
    return () => {
      disposed = true;
      clearTimeout(timer);
      worker.postMessage({ cancel: true, park: true });
      worker.terminate();
    };
  }, [images, viewport.width, viewport.height, enabled]);
  return null;
};

const CoveragePhoto = ({
  image,
  viewport,
  active,
  measuring,
  points,
  onMeasure,
  onFinish,
  onOpen,
}: {
  image: ObjectCoverageImage;
  viewport: { width: number; height: number };
  active: boolean;
  measuring: boolean;
  points: readonly Vector3[];
  onMeasure: (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => void;
  onFinish: () => void;
  onOpen: (imageId: string) => void;
}) => {
  const { record, dataset } = image;
  const { calibration, crop, window, pixelRatio } = coverageWindow(
    image,
    viewport
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositionWorker = useRef<Worker | null>(null);
  const compositionGeneration = useRef(0);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const workerSupported =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const level = String(
    Math.max(
      Number(dataset.minimumPreviewQualityLevel ?? "0"),
      Math.min(
        6,
        Math.floor(Math.log2((8 * crop.width) / (viewport.width * pixelRatio)))
      )
    )
  ) as PreviewQualityLevel;
  const legacyPreviewUrl = getImageUrls(
    record.sourceId,
    dataset.previewPath,
    dataset.minimumPreviewQualityLevel ?? "0"
  ).previewUrl;
  const original = originalOf(image);
  const pyramid = pyramidOf(image);
  const previewUrl = dataset.avifOnly ? pyramid ?? null : legacyPreviewUrl;
  const progressiveSource = useProgressivePreviewSource({
    finalPreviewUrl:
      active && !dataset.avifOnly && (!workerSupported || failed) && !original
        ? previewUrl
        : null,
    initialPreviewUrl: dataset.avifOnly
      ? undefined
      : getPreviewImageUrl(dataset.previewPath, level, record.sourceId),
    previewPath:
      active && !dataset.avifOnly && (!workerSupported || failed)
        ? dataset.previewPath
        : undefined,
    imageId:
      active && !dataset.avifOnly && (!workerSupported || failed)
        ? record.sourceId
        : undefined,
  });
  const currentSource =
    !dataset.avifOnly &&
    active &&
    (!workerSupported || failed) &&
    progressiveSource &&
    Object.values(PREVIEW_QUALITY).some(
      (q) =>
        progressiveSource ===
        getPreviewImageUrl(dataset.previewPath, q, record.sourceId)
    )
      ? progressiveSource
      : null;
  useEffect(
    () => () => {
      compositionWorker.current?.terminate();
      compositionWorker.current = null;
    },
    [active]
  );
  useEffect(() => {
    if (
      !active ||
      !workerSupported ||
      !canvasRef.current ||
      !previewUrl ||
      viewport.width <= 1 ||
      viewport.height <= 1
    )
      return;
    const canvas = canvasRef.current;
    let worker: Worker;
    try {
      worker =
        compositionWorker.current ??
        new Worker(new URL("./utils/preview-rgb.worker.ts", import.meta.url), {
          type: "module",
        });
      compositionWorker.current = worker;
    } catch {
      setFailed(true);
      return;
    }
    let disposed = false;
    const generation = ++compositionGeneration.current;
    setReady(false);
    setFailed(false);
    const fail = () => {
      if (!disposed) {
        setFailed(true);
        worker.terminate();
        if (compositionWorker.current === worker)
          compositionWorker.current = null;
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      fail,
      90000
    );
    worker.onmessage = (
      event: MessageEvent<{
        bitmap?: ImageBitmap;
        generation?: number;
        error?: string;
      }>
    ) => {
      const bitmap = event.data.bitmap;
      if (disposed || event.data.generation !== generation) {
        bitmap?.close();
        return;
      }
      if (!bitmap || event.data.error) {
        bitmap?.close();
        fail();
        return;
      }
      clearTimeout(timer);
      timer = undefined;
      try {
        const context = canvas.getContext("2d");
        if (!context) {
          fail();
          return;
        }
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        setReady(true);
      } finally {
        bitmap.close();
      }
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.postMessage({
      url: new URL(original ?? previewUrl, globalThis.window.location.href)
        .href,
      window,
      nativeSize: { width: calibration.widthPx, height: calibration.heightPx },
      avifOnly: dataset.avifOnly,
      tiff: !!original,
      avifPyramidUrl: pyramid
        ? new URL(pyramid, globalThis.window.location.href).href
        : undefined,
      flipForTexture: false,
      generation,
      minimumQualityLevel: dataset.minimumPreviewQualityLevel,
      retainedSourceByteLimit: 64 * 1024 * 1024,
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      worker.onmessage = null;
      worker.postMessage({ cancel: true, park: true });
    };
  }, [
    active,
    workerSupported,
    previewUrl,
    original,
    pyramid,
    calibration.widthPx,
    calibration.heightPx,
    window.source.x,
    window.source.y,
    window.source.width,
    window.source.height,
    window.target.width,
    window.target.height,
    viewport.width,
    viewport.height,
    dataset.minimumPreviewQualityLevel,
  ]);

  const projected = useMemo(
    () =>
      points.map((point) => {
        if (!image.projection) return null;
        const p = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
          image.projection
        );
        return p.w > 0
          ? {
              x:
                (((p.x / p.w) * calibration.widthPx + 0.5 - crop.x) /
                  crop.width) *
                viewport.width,
              y:
                (((1 - p.y / p.w) * calibration.heightPx + 0.5 - crop.y) /
                  crop.height) *
                viewport.height,
            }
          : null;
      }),
    [
      points,
      image.projection,
      calibration.widthPx,
      calibration.heightPx,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      viewport.width,
      viewport.height,
    ]
  );
  return (
    <div
      role="button"
      tabIndex={active ? 0 : -1}
      aria-label={`Bild ${record.sourceId} im Hauptfenster öffnen`}
      data-test-id="oblique-coverage-photo"
      data-image-id={record.id}
      data-source-crop={`${crop.x},${crop.y},${crop.width},${crop.height}`}
      data-pixel-scale={(viewport.width * pixelRatio) / crop.width}
      onClick={(event) => {
        if (!active || !measuring || event.detail > 1) return;
        const box = event.currentTarget.getBoundingClientRect();
        onMeasure(image, {
          x: crop.x + ((event.clientX - box.left) * crop.width) / box.width,
          y: crop.y + ((event.clientY - box.top) * crop.height) / box.height,
        });
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        if (measuring) onFinish();
        else onOpen(record.id);
      }}
      onKeyDown={(event) => {
        if (!measuring && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(record.id);
        }
      }}
      title={
        measuring
          ? "Oberflächenpunkt messen; Doppelklick beendet die Strecke"
          : "Doppelklick öffnet das Bild im Hauptfenster"
      }
      style={{
        height: viewport.height,
        width: viewport.width,
        position: "relative",
        overflow: "hidden",
        background: "#0f172a",
        cursor: measuring ? "crosshair" : "zoom-in",
      }}
    >
      {currentSource && (
        <img
          src={currentSource}
          crossOrigin="anonymous"
          alt={record.sourceId}
          draggable={false}
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
          left: `${(100 * (window.source.x - crop.x)) / crop.width}%`,
          top: `${(100 * (window.source.y - crop.y)) / crop.height}%`,
          width: `${(100 * window.source.width) / crop.width}%`,
          height: `${(100 * window.source.height) / crop.height}%`,
          opacity: ready ? 1 : 0,
        }}
      />
      {active && points.length > 0 && (
        <svg
          data-test-id="oblique-coverage-measurement"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {projected.map((p, index) => {
            const previous = projected[index - 1];
            return (
              p && (
                <g key={index}>
                  {previous && (
                    <>
                      <line
                        x1={previous.x}
                        y1={previous.y}
                        x2={p.x}
                        y2={p.y}
                        stroke="#fff"
                        strokeWidth={4}
                      />
                      <line
                        x1={previous.x}
                        y1={previous.y}
                        x2={p.x}
                        y2={p.y}
                        stroke="#267bdc"
                        strokeWidth={2}
                      />
                      <text
                        x={(p.x + previous.x) / 2}
                        y={(p.y + previous.y) / 2 - 7}
                        textAnchor="middle"
                        fill="#fff"
                        stroke="#0f172a"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={12}
                      >
                        {points[index]
                          .distanceTo(points[index - 1])
                          .toLocaleString("de-DE", {
                            maximumFractionDigits: 2,
                          })}{" "}
                        m
                      </text>
                    </>
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="#fff"
                    stroke="#267bdc"
                    strokeWidth={2}
                  />
                </g>
              )
            );
          })}
        </svg>
      )}
      {!ready && !currentSource && (
        <span
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#cbd5e1",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {failed
            ? "Vorschaubild nicht verfügbar"
            : "Vorschaubild wird geladen …"}
        </span>
      )}
    </div>
  );
};

const CoverageQuadrant = ({
  label,
  images,
  loading,
  measuring,
  points,
  onMeasure,
  onFinish,
  onOpen,
}: {
  label: string;
  images: readonly ObjectCoverageImage[];
  loading: boolean;
  measuring: boolean;
  points: readonly Vector3[];
  onMeasure: (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => void;
  onFinish: () => void;
  onOpen: (imageId: string) => void;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null),
    carouselRef = useRef<CarouselRef>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 }),
    [activeIndex, setActiveIndex] = useState(0),
    [preload, setPreload] = useState(false);
  const token = useMemo(
    () => images.map((image) => image.record.id).join("|"),
    [images]
  );
  useEffect(() => {
    setActiveIndex(0);
    setPreload(false);
  }, [token]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const resize = () => {
      const width = Math.max(1, Math.round(element.clientWidth)),
        height = Math.max(1, Math.round(element.clientHeight));
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
  const preloadStartIndex = useRef(0);
  const enablePreload = () => {
    if (preload) return;
    preloadStartIndex.current = activeIndex;
    setPreload(true);
  };
  const alternatives = useMemo(
    () => images.filter((_, index) => index !== preloadStartIndex.current),
    [images, preload]
  );
  return (
    <section
      aria-label={`Objektansichtenabfrage ${label}`}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 30,
          padding: "2px 8px",
          color: "white",
          fontSize: 12,
        }}
      >
        <Tooltip title="Alternativen dieser Richtung im Hintergrund vorladen">
          <Button
            size="small"
            aria-label={`${label}: Alternativen vorladen`}
            onClick={enablePreload}
            style={{ fontWeight: 800 }}
          >
            {label}
          </Button>
        </Tooltip>
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
            ref={carouselRef}
            infinite={false}
            lazyLoad="ondemand"
            arrows={images.length > 1}
            dots={false}
            beforeChange={(_, next) => {
              enablePreload();
              setActiveIndex(next);
            }}
          >
            {images.map((image, index) => (
              <div key={image.record.id}>
                <CoveragePhoto
                  image={image}
                  viewport={viewport}
                  active={index === activeIndex}
                  measuring={measuring}
                  points={points}
                  onMeasure={onMeasure}
                  onFinish={onFinish}
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
              ? "Objektansichten werden ermittelt …"
              : "Kein Bild umfasst die vollständige Kugel"}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div
          aria-label={`${label}: Bildalternativen`}
          style={{
            display: "flex",
            gap: 3,
            overflowX: "auto",
            flexShrink: 0,
            padding: 3,
            height: 48,
          }}
        >
          {images.map((image, index) => (
            <button
              key={image.record.id}
              type="button"
              aria-label={`${label} Bild ${index + 1}: ${
                image.record.sourceId
              }`}
              aria-pressed={index === activeIndex}
              title={image.record.sourceId}
              onClick={() => {
                enablePreload();
                carouselRef.current?.goTo(index);
              }}
              style={{
                padding: 0,
                border: `2px solid ${
                  index === activeIndex ? "#1677ff" : "transparent"
                }`,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <CoverageThumbnail image={image} />
            </button>
          ))}
        </div>
      )}
      <CoveragePreload
        images={alternatives}
        viewport={viewport}
        enabled={preload}
      />
    </section>
  );
};

/** One metric measurement is projected into every active calibrated photograph. */
export const ObliqueObjectCoverage = ({
  map,
  surfacePicker,
  sphere,
  groups,
  loading = false,
  onOpen,
  onReset,
  onCancel,
}: {
  map?: MaplibreMap | null;
  surfacePicker?: Pick<
    ReturnType<typeof createPhotoAxisPicker>,
    "intersectSurface"
  > | null;
  sphere: ObjectCoverageSphere;
  groups: ObjectCoverageGroups;
  loading?: boolean;
  onOpen: (imageId: string) => void;
  onReset?: () => void;
  onCancel?: () => void;
}) => {
  const [measuring, setMeasuring] = useState(false),
    [points, setPoints] = useState<Vector3[]>([]),
    [measurementError, setMeasurementError] = useState<string | null>(null);
  const sphereKey = `${sphere.center.longitude}|${sphere.center.latitude}|${sphere.center.heightMeters}|${sphere.radiusMeters}`;
  useEffect(() => {
    setPoints([]);
    setMeasuring(false);
    setMeasurementError(null);
  }, [sphereKey]);
  const onMeasure = useCallback(
    (image: ObjectCoverageImage, pixel: { x: number; y: number }) => {
      if (!map || !measuring) return;
      const calibration = getCameraCalibration(
        image.dataset,
        image.record.cameraId
      );
      if (
        pixel.x < 0 ||
        pixel.y < 0 ||
        pixel.x > calibration.widthPx ||
        pixel.y > calibration.heightPx
      )
        return;
      const pose = image.record.pose,
        altitude = image.cameraAltitudeMeters;
      if (!pose || altitude === undefined) {
        setMeasurementError("Bildorientierung fehlt");
        return;
      }
      const lease = acquireSharedThreeScene(map);
      try {
        const frame = lease.layer.getLocalFrame(),
          origin = lease.layer.projectSceneToLngLat([0, 0, 0]);
        if (!frame || !origin) return;
        const photoToScene = sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          pose,
          altitude
        ).invert();
        const projection = imageProjectionMatrix(
          image.record,
          calibration,
          pose,
          photoToScene.clone().invert()
        );
        const e = projection.elements,
          u = (pixel.x - 0.5) / calibration.widthPx,
          v = 1 - (pixel.y - 0.5) / calibration.heightPx;
        const horizontal = new Vector3(
          e[0] - u * e[3],
          e[4] - u * e[7],
          e[8] - u * e[11]
        );
        const vertical = new Vector3(
          e[1] - v * e[3],
          e[5] - v * e[7],
          e[9] - v * e[11]
        );
        const direction = horizontal.cross(vertical).normalize();
        if (direction.dot(new Vector3(e[3], e[7], e[11])) < 0)
          direction.negate();
        const ray = new Raycaster(
          new Vector3().applyMatrix4(photoToScene),
          direction
        );
        (ray as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
        let hit: { point: Vector3 } | null =
          surfacePicker?.intersectSurface(ray, [
            pose.longitude,
            pose.latitude,
          ]) ?? null;
        if (!surfacePicker) {
          const meshes: Mesh[] = [];
          for (const runtime of getSharedThreeSceneRuntimes(map))
            if (
              runtime.root.visible &&
              (runtime.receivesMapStyleTexture || runtime.providesTerrain)
            )
              runtime.root.traverseVisible((object) => {
                const mesh = object as Mesh;
                if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
              });
          hit = ray.intersectObjects(meshes, false)[0] ?? null;
        }
        if (!hit) {
          setMeasurementError(
            "An dieser Bildstelle ist noch keine Oberfläche geladen."
          );
          return;
        }
        const local = hit.point
          .clone()
          .applyMatrix4(
            sceneToPhotoEnu(origin, frame.sceneFromLocal, sphere.center, 0)
          );
        const physical = new Vector3(local.x, local.z, -local.y);
        setPoints((previous) => [...previous, physical]);
        setMeasurementError(null);
      } finally {
        lease.release();
      }
    },
    [map, surfacePicker, measuring, sphere.center]
  );
  const distance = useMemo(
    () =>
      points.reduce(
        (sum, point, index) =>
          sum + (index ? point.distanceTo(points[index - 1]) : 0),
        0
      ),
    [points]
  );
  return (
    <div
      data-test-id="oblique-object-coverage"
      data-oblique-coverage-ui="true"
      role="region"
      aria-label={`Objektansichtenabfrage, Radius ${sphere.radiusMeters.toFixed(
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
        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
        gridTemplateRows: "repeat(2,minmax(0,1fr))",
        gap: 2,
        padding: 2,
        paddingTop: "calc(4rem + env(safe-area-inset-top))",
        paddingBottom: 44,
        background: "#e2e8f0",
      }}
    >
      {DIRECTIONS.map(({ direction, label }) => (
        <CoverageQuadrant
          key={`${direction}:${sphereKey}`}
          label={label}
          images={groups.get(direction) ?? EMPTY_IMAGES}
          loading={loading}
          measuring={measuring}
          points={points}
          onMeasure={onMeasure}
          onFinish={() => setMeasuring(false)}
          onOpen={onOpen}
        />
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 4,
          right: 4,
          display: "flex",
          gap: 6,
          alignItems: "center",
          overflowX: "auto",
          whiteSpace: "nowrap",
          flexWrap: "nowrap",
          padding: 2,
          background: "white",
        }}
      >
        <strong style={{ fontSize: 12 }}>Objektansichtenabfrage</strong>
        <Button
          size="small"
          aria-pressed={measuring}
          type={measuring ? "primary" : "default"}
          disabled={!map}
          onClick={() => {
            setMeasuring((value) => !value);
            setMeasurementError(null);
          }}
        >
          {measuring ? "Messung beenden" : "Strecke messen"}
        </Button>
        {points.length > 0 && (
          <>
            <span style={{ fontSize: 12 }}>
              {distance.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m
            </span>
            <Button
              size="small"
              onClick={() => setPoints((value) => value.slice(0, -1))}
            >
              Letzten Punkt entfernen
            </Button>
            <Button
              size="small"
              onClick={() => {
                setPoints([]);
                setMeasurementError(null);
              }}
            >
              Messung löschen
            </Button>
          </>
        )}
        {measurementError && (
          <span role="status" style={{ fontSize: 12, color: "#b45309" }}>
            {measurementError}
          </span>
        )}
        <span style={{ marginLeft: "auto" }} />
        {onReset && (
          <Button size="small" onClick={onReset}>
            Kugel neu wählen
          </Button>
        )}
        {onCancel && (
          <Button size="small" onClick={onCancel}>
            Schließen
          </Button>
        )}
      </div>
    </div>
  );
};
