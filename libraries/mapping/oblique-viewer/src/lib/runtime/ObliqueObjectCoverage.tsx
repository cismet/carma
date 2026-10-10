import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faImage,
  faBan,
  faCrosshairs,
  faRotateLeft,
  faRuler,
  faTrashCan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button, Tooltip } from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Raycaster, Vector3, type Mesh } from "three";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";

import { CompassNeedleSVG } from "@carma-mapping/components";
import { useObliqueObjectWindowActions } from "./object-views/ObliqueObjectResultWindow";

import type { RasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import type { CardinalDirection } from "../core/types";
import {
  fitObjectCoverageCrop,
  objectCoveragePixelRay,
  projectObjectCoveragePoint,
  type ObjectCoverageGroups,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "../core/utils/object-coverage";
import { getCameraCalibration } from "../core/utils/calibration";
import {
  ImageViewportPool,
  type ImageViewportHandle,
  type NativePreviewWindow,
} from "@carma-commons/image-pyramid";
import { nativePixelPool } from "./utils/native-preview-pool";
import {
  originalOf,
  pyramidOf,
  viewportSourceOf,
  viewportPyramidSourceOf,
} from "./utils/oblique-viewport-source";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../core/utils/image-projection";

import type {
  createPhotoAxisPicker,
  PhotoAxisSurfaceMode,
} from "./utils/photo-axis-picker";
import "./oblique-object-coverage.css";

const DIRECTIONS: readonly { direction: CardinalDirection; label: string }[] = [
  { direction: 0, label: "N" },
  { direction: 1, label: "O" },
  { direction: 3, label: "W" },
  { direction: 2, label: "S" },
];
const EMPTY_IMAGES: readonly ObjectCoverageImage[] = [];
const THUMBNAIL_SIZE = 56;

/** Project geographic north through the same calibrated image as the object crop. */
const CoverageCompass = ({
  image,
  sphere,
}: {
  image?: ObjectCoverageImage;
  sphere: ObjectCoverageSphere;
}) => {
  let heading = image?.record.pose?.bearingDeg ?? 0;
  if (image?.projection) {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const center = new Vector3(0, sphere.center.heightMeters, 0);
    const pixel = projectObjectCoveragePoint(
      image.projection,
      center,
      calibration
    );
    const north = projectObjectCoveragePoint(
      image.projection,
      center.clone().add(new Vector3(0, 0, -Math.max(1, sphere.radiusMeters))),
      calibration
    );
    if (
      pixel &&
      north &&
      Math.hypot(north.x - pixel.x, north.y - pixel.y) > 1e-8
    )
      heading =
        -(Math.atan2(north.x - pixel.x, pixel.y - north.y) * 180) / Math.PI;
  }
  return (
    <span
      className="oblique-object-compass"
      role="img"
      aria-label="Nordrichtung im Bild"
      title="Nordrichtung im Bild"
    >
      <CompassNeedleSVG
        heading={heading}
        northColor="#1677ff"
        neutralColor="#64748b"
      />
    </span>
  );
};

/** Keep the sphere in view, expand to the cell aspect, and cap physical-pixel magnification at 3x. */
const coverageWindow = (
  image: ObjectCoverageImage,
  viewport: { width: number; height: number; pixelRatio?: number }
) => {
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const pixelRatio = viewport.pixelRatio ?? (globalThis.devicePixelRatio || 1);
  // Calibration and measurement coordinates stay in the original sensor frame.
  const finestSourceDensity =
    2 ** -Number(image.dataset.minimumPreviewQualityLevel ?? "0");
  const crop = fitObjectCoverageCrop(
    image.crop,
    {
      width: Math.max(1, viewport.width) as CssPixels,
      height: Math.max(1, viewport.height) as CssPixels,
    },
    pixelRatio as Ratio,
    finestSourceDensity as Ratio
  );
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
        Math.round((viewport.width * pixelRatio * source.width) / crop.width)
      ) as DevicePixels,
      height: Math.max(
        1,
        Math.round((viewport.height * pixelRatio * source.height) / crop.height)
      ) as DevicePixels,
    },
  };
  return { calibration, crop, window, pixelRatio };
};

const CoverageThumbnail = ({
  image,
  sphere,
  pool,
}: {
  image: ObjectCoverageImage;
  sphere: ObjectCoverageSphere;
  pool: ImageViewportPool;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const contentKey = JSON.stringify([
    image.record.id,
    pyramidOf(image),
    originalOf(image),
    image.dataset.previewPath,
    image.dataset.minimumPreviewQualityLevel,
    image.crop,
  ]);
  const [paintedContent, setPaintedContent] = useState<string | null>(null);
  const ready = paintedContent === contentKey;
  const [pixelRatio, setPixelRatio] = useState(1);
  const thumbnail = useMemo(
    () =>
      coverageWindow(image, {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        pixelRatio,
      }),
    [image, pixelRatio]
  );
  const sphereClip = useMemo(() => {
    const { crop, calibration } = thumbnail;
    const fallback = `ellipse(${(image.crop.width / crop.width) * 50}% ${
      (image.crop.height / crop.height) * 50
    }% at 50% 50%)`;
    const pose = image.record.pose;
    if (!pose || !image.projection || image.cameraAltitudeMeters === undefined)
      return fallback;
    const center = new Vector3(0, sphere.center.heightMeters, 0);
    const camera = new Vector3().applyMatrix4(
      sceneToPhotoEnu(
        [sphere.center.longitude, sphere.center.latitude],
        new Matrix4(),
        pose,
        image.cameraAltitudeMeters
      ).invert()
    );
    const axis = camera.sub(center);
    const distanceSquared = axis.lengthSq();
    const radiusSquared = sphere.radiusMeters ** 2;
    if (!(distanceSquared > radiusSquared)) return fallback;
    // The silhouette is the calibrated projection of the sphere's tangent circle.
    const ringCenter = center
      .clone()
      .addScaledVector(axis, radiusSquared / distanceSquared);
    const ringRadius =
      sphere.radiusMeters * Math.sqrt(1 - radiusSquared / distanceSquared);
    axis.normalize();
    const right = new Vector3(
      Math.abs(axis.y) > 0.9 ? 1 : 0,
      Math.abs(axis.y) > 0.9 ? 0 : 1,
      0
    )
      .cross(axis)
      .normalize();
    const up = axis.clone().cross(right);
    const outline: string[] = [];
    for (let index = 0; index < 48; index++) {
      const angle = (index / 48) * Math.PI * 2;
      const pixel = projectObjectCoveragePoint(
        image.projection,
        ringCenter
          .clone()
          .addScaledVector(right, Math.cos(angle) * ringRadius)
          .addScaledVector(up, Math.sin(angle) * ringRadius),
        calibration
      );
      if (!pixel) return fallback;
      outline.push(
        `${((pixel.x - crop.x) / crop.width) * 100}% ${
          ((pixel.y - crop.y) / crop.height) * 100
        }%`
      );
    }
    return `polygon(${outline.join(",")})`;
  }, [image, sphere, thumbnail]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const host = element.closest("[data-oblique-object-window]");
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const owner = element.ownerDocument.defaultView as
        | (Window & typeof globalThis)
        | null;
      setPixelRatio(Math.min(2, owner?.devicePixelRatio || 1));
      const Observer = owner?.IntersectionObserver;
      if (!Observer) {
        setVisible(true);
        return;
      }
      setVisible(false);
      observer = new Observer(([entry]) => setVisible(entry.isIntersecting));
      observer.observe(element);
    };
    observe();
    host?.addEventListener("oblique-object-window-change", observe);
    return () => {
      observer?.disconnect();
      host?.removeEventListener("oblique-object-window-change", observe);
    };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !visible ||
      !canvas ||
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined"
    )
      return;
    const { window, crop } = thumbnail;
    // A separate bounded pool shares the decoder and persistent cache, while
    // thumbnail ROIs can never replace an active photograph's viewport.
    const handle = pool.acquire(viewportSourceOf(image));
    // Canvas pixels survive portal adoption and lease renewal. Keep the same
    // source/ROI visible while its new realm or density is being refreshed.
    const unsubscribe = handle.subscribe(({ bitmap, frame }) => {
      if (!bitmap || !frame) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.round(THUMBNAIL_SIZE * pixelRatio);
      canvas.height = Math.round(THUMBNAIL_SIZE * pixelRatio);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        bitmap,
        ((frame.source.x - crop.x) / crop.width) * canvas.width,
        ((frame.source.y - crop.y) / crop.height) * canvas.height,
        (frame.source.width / crop.width) * canvas.width,
        (frame.source.height / crop.height) * canvas.height
      );
      setPaintedContent(contentKey);
    });
    handle.setViewport(window, undefined, { priority: "low" });
    return () => {
      unsubscribe();
      handle.release();
    };
  }, [image, pool, visible, pixelRatio, contentKey, thumbnail]);
  return (
    <span
      ref={ref}
      className="oblique-object-thumbnail-image"
      style={{ clipPath: sphereClip }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={image.record.sourceId}
        data-test-id="oblique-coverage-thumbnail"
        style={{
          display: ready ? "block" : "none",
          width: "100%",
          height: "100%",
        }}
      />
      {!ready && (
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            color: "#cbd5e1",
          }}
        >
          <FontAwesomeIcon icon={faImage} />
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
  pool,
}: {
  images: readonly ObjectCoverageImage[];
  viewport: { width: number; height: number; pixelRatio?: number };
  enabled: boolean;
  pool: ImageViewportPool;
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
    let disposed = false,
      index = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let handle: ImageViewportHandle | null = null;
    let unsubscribe: (() => void) | undefined;
    const release = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      handle?.release();
      handle = null;
    };
    const next = () => {
      clearTimeout(timer);
      release();
      if (disposed || index >= images.length) return;
      const image = images[index++];
      const { window } = coverageWindow(image, viewport);
      const current = pool.acquire(viewportSourceOf(image));
      handle = current;
      current.setViewport(window, undefined, { priority: "low" });
      let finished = false;
      timer = setTimeout(next, 20000);
      unsubscribe = current.subscribe((snapshot) => {
        if (disposed || finished) return;
        const frame = snapshot.frame;
        const bitmap = snapshot.bitmap;
        const density =
          bitmap && frame
            ? Math.min(
                bitmap.width / frame.source.width,
                bitmap.height / frame.source.height
              )
            : 0;
        const needed = Math.min(
          window.target.width / window.source.width,
          window.target.height / window.source.height,
          snapshot.source.maxSourceDensity ?? 1
        );
        const covers =
          frame &&
          frame.source.x <= window.source.x &&
          frame.source.y <= window.source.y &&
          frame.source.x + frame.source.width >=
            window.source.x + window.source.width &&
          frame.source.y + frame.source.height >=
            window.source.y + window.source.height;
        if (
          snapshot.error ||
          (!snapshot.loading && covers && density >= needed)
        ) {
          finished = true;
          clearTimeout(timer);
          timer = setTimeout(next, 175);
        }
      });
    };
    timer = setTimeout(next, 175);
    return () => {
      disposed = true;
      clearTimeout(timer);
      release();
    };
  }, [
    images,
    viewport.width,
    viewport.height,
    viewport.pixelRatio,
    enabled,
    pool,
  ]);
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
  pool,
}: {
  image: ObjectCoverageImage;
  viewport: { width: number; height: number; pixelRatio?: number };
  active: boolean;
  measuring: boolean;
  points: readonly Vector3[];
  onMeasure: (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => void;
  onFinish: () => void;
  onOpen: (imageId: string) => void;
  pool: ImageViewportPool;
}) => {
  const { record, dataset } = image;
  const { calibration, crop, window, pixelRatio } = coverageWindow(
    image,
    viewport
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const workerSupported =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const pyramid = pyramidOf(image);
  const previewUrl = pyramid ?? null;
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
    const handle = pool.acquire(viewportSourceOf(image));
    setFailed(false);
    let shown: ImageBitmap | null = null;
    const unsubscribe = handle.subscribe((snapshot) => {
      const bitmap = snapshot.bitmap;
      const frame = snapshot.frame;
      setFailed(Boolean(snapshot.error));
      setReady(Boolean(bitmap));
      if (bitmap && frame && shown !== bitmap) {
        const context = canvas.getContext("2d");
        if (!context) {
          setFailed(true);
          return;
        }
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        shown = bitmap;
        Object.assign(canvas.style, {
          left: `${(100 * (frame.source.x - crop.x)) / crop.width}%`,
          top: `${(100 * (frame.source.y - crop.y)) / crop.height}%`,
          width: `${(100 * frame.source.width) / crop.width}%`,
          height: `${(100 * frame.source.height) / crop.height}%`,
        });
      }
    });
    handle.setViewport(window);
    return () => {
      unsubscribe();
      handle.release();
      // The pooled bitmap stays warm; inactive DOM slides hold no pixel copy.
      canvas.width = canvas.height = 1;
    };
  }, [
    pool,
    image,
    active,
    workerSupported,
    previewUrl,
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
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    dataset.minimumPreviewQualityLevel,
  ]);

  const projected = useMemo(
    () =>
      points.map((point) => {
        if (!image.projection) return null;
        const pixel = projectObjectCoveragePoint(
          image.projection,
          point,
          calibration
        );
        return pixel
          ? {
              x: ((pixel.x - crop.x) / crop.width) * viewport.width,
              y: ((pixel.y - crop.y) / crop.height) * viewport.height,
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
      {!ready && (
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
  corner,
  sphere,
  images,
  loading,
  measuring,
  points,
  onMeasure,
  onFinish,
  onOpen,
  pool,
  thumbnailPool,
}: {
  label: string;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  sphere: ObjectCoverageSphere;
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
  pool: ImageViewportPool;
  thumbnailPool: ImageViewportPool;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
      width: 1,
      height: 1,
      pixelRatio: 1,
    }),
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
        height = Math.max(1, Math.round(element.clientHeight)),
        pixelRatio = element.ownerDocument.defaultView?.devicePixelRatio || 1;
      setViewport((previous) =>
        previous.width === width &&
        previous.height === height &&
        previous.pixelRatio === pixelRatio
          ? previous
          : { width, height, pixelRatio }
      );
    };
    const host = element.closest("[data-oblique-object-window]");
    let owner: (Window & typeof globalThis) | null = null;
    let observer: ResizeObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      owner?.removeEventListener("resize", resize);
      owner = element.ownerDocument.defaultView as
        | (Window & typeof globalThis)
        | null;
      const Observer = owner?.ResizeObserver;
      observer = Observer ? new Observer(resize) : undefined;
      observer?.observe(element);
      owner?.addEventListener("resize", resize);
      resize();
    };
    observe();
    host?.addEventListener("oblique-object-window-change", observe);
    return () => {
      observer?.disconnect();
      owner?.removeEventListener("resize", resize);
      host?.removeEventListener("oblique-object-window-change", observe);
    };
  }, []);
  const active = images[activeIndex];
  const enablePreload = () => {
    if (preload) return;
    setPreload(true);
  };
  const alternatives = useMemo(
    () =>
      [images[activeIndex + 1], images[activeIndex - 1]].filter(
        (image): image is ObjectCoverageImage => Boolean(image)
      ),
    [images, activeIndex]
  );
  // Bound both thumbnail subscriptions and DOM work independently of catalog size.
  const thumbnailCount =
    viewport.width < 260 ? 2 : viewport.width < 360 ? 3 : 4;
  const thumbnailStart = Math.max(
    0,
    Math.min(activeIndex - 1, images.length - thumbnailCount)
  );
  const thumbnails = images.slice(
    thumbnailStart,
    thumbnailStart + thumbnailCount
  );
  const choose = (index: number) => {
    if (index < 0 || index >= images.length) return;
    enablePreload();
    setActiveIndex(index);
  };
  return (
    <section
      aria-label={`Objektansichtenabfrage ${label}`}
      className="oblique-object-quadrant"
      data-compass-corner={corner}
    >
      <div ref={viewportRef} className="oblique-object-photo-viewport">
        {active ? (
          <CoveragePhoto
            key={active.record.id}
            image={active}
            viewport={viewport}
            active={true}
            measuring={measuring}
            points={points}
            onMeasure={onMeasure}
            onFinish={onFinish}
            onOpen={onOpen}
            pool={pool}
          />
        ) : (
          <div role="status" className="oblique-object-empty">
            {loading
              ? "Objektansichten werden ermittelt …"
              : "Kein Bild umfasst die vollständige Kugel"}
          </div>
        )}
      </div>
      <div className="oblique-object-image-label">
        <Tooltip title="Benachbarte Bilder dieser Richtung vorladen">
          <Button
            size="small"
            aria-label={`${label}: Alternativen vorladen`}
            onClick={enablePreload}
          >
            {label}
          </Button>
        </Tooltip>
        <span
          className="oblique-object-image-title"
          title={
            active
              ? `${active.dataset.label} · ${active.record.sourceId}`
              : undefined
          }
        >
          {active
            ? `${active.dataset.shortLabel ?? active.dataset.label} · ${
                active.record.sourceId
              }`
            : label}
        </span>
        <span
          className="oblique-object-image-count"
          title={
            active
              ? `${active.pixelsPerMeter.toFixed(1)} Pixel pro Meter`
              : undefined
          }
        >
          {images.length ? `${activeIndex + 1}/${images.length}` : "0 Bilder"}
        </span>
      </div>
      <CoverageCompass image={active} sphere={sphere} />
      {images.length > 1 && (
        <div
          className="oblique-object-carousel"
          aria-label={`${label}: Bildalternativen`}
        >
          <Tooltip title="Vorheriges Bild">
            <Button
              size="small"
              aria-label={`${label}: Vorheriges Bild`}
              disabled={activeIndex <= 0}
              icon={<FontAwesomeIcon icon={faChevronLeft} />}
              onMouseEnter={enablePreload}
              onFocus={enablePreload}
              onClick={() => choose(activeIndex - 1)}
            />
          </Tooltip>
          <div className="oblique-object-thumbnails">
            {thumbnails.map((image, offset) => {
              const index = thumbnailStart + offset;
              return (
                <button
                  key={image.record.id}
                  type="button"
                  className="oblique-object-thumbnail"
                  aria-label={`${label} Bild ${index + 1}: ${
                    image.record.sourceId
                  }`}
                  aria-pressed={index === activeIndex}
                  title={image.record.sourceId}
                  onMouseEnter={enablePreload}
                  onFocus={enablePreload}
                  onClick={() => choose(index)}
                >
                  <CoverageThumbnail
                    image={image}
                    sphere={sphere}
                    pool={thumbnailPool}
                  />
                </button>
              );
            })}
          </div>
          <Tooltip title="Nächstes Bild">
            <Button
              size="small"
              aria-label={`${label}: Nächstes Bild`}
              disabled={activeIndex >= images.length - 1}
              icon={<FontAwesomeIcon icon={faChevronRight} />}
              onMouseEnter={enablePreload}
              onFocus={enablePreload}
              onClick={() => choose(activeIndex + 1)}
            />
          </Tooltip>
        </div>
      )}
      <CoveragePreload
        images={alternatives}
        viewport={viewport}
        enabled={preload}
        pool={pool}
      />
    </section>
  );
};

/** One metric measurement is projected into every active calibrated photograph. */
export const ObliqueObjectCoverage = ({
  map,
  surfacePicker,
  surfaceMode = "auto",
  sphere,
  groups,
  loading = false,
  onOpen,
  onReset,
  onCancel,
  embedded = false,
}: {
  map?: MaplibreMap | null;
  surfacePicker?: Pick<
    ReturnType<typeof createPhotoAxisPicker>,
    "intersectSurface"
  > | null;
  surfaceMode?: PhotoAxisSurfaceMode;
  sphere: ObjectCoverageSphere;
  groups: ObjectCoverageGroups;
  loading?: boolean;
  onOpen: (imageId: string) => void;
  onReset?: () => void;
  onCancel?: () => void;
  /** Dialog/window hosts fill the available extent; standalone views clear the main navigation. */
  embedded?: boolean;
}) => {
  const windowActions = useObliqueObjectWindowActions();
  const [imagePool] = useState(
    () =>
      new ImageViewportPool({
        sharedStackPool: nativePixelPool,
        resolvePyramidSource: viewportPyramidSourceOf,
        maxImages: 8,
        maxBytes: 128 * 1024 * 1024,
        retainedSourceBytes: 4 * 1024 * 1024,
      })
  );
  const [thumbnailPool] = useState(
    () =>
      new ImageViewportPool({
        sharedStackPool: nativePixelPool,
        resolvePyramidSource: viewportPyramidSourceOf,
        maxImages: 16,
        maxBytes: 8 * 1024 * 1024,
        retainedSourceBytes: 1024 * 1024,
      })
  );
  const poolDisposeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => {
    clearTimeout(poolDisposeTimer.current);
    return () => {
      // React StrictMode reuses the owner across its effect setup replay.
      poolDisposeTimer.current = setTimeout(() => {
        imagePool.dispose();
        thumbnailPool.dispose();
      }, 0);
    };
  }, [imagePool, thumbnailPool]);
  const [measuring, setMeasuring] = useState(false),
    [points, setPoints] = useState<Vector3[]>([]),
    [measurementError, setMeasurementError] = useState<string | null>(null);
  const sphereKey = `${sphere.center.longitude}|${sphere.center.latitude}|${sphere.center.heightMeters}|${sphere.radiusMeters}`;
  useEffect(() => {
    setPoints([]);
    setMeasuring(false);
    setMeasurementError(null);
  }, [sphereKey, surfaceMode]);
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
        const photoRay = objectCoveragePixelRay(
          projection,
          new Vector3().applyMatrix4(photoToScene),
          { x: pixel.x as DevicePixels, y: pixel.y as DevicePixels },
          calibration
        );
        if (!photoRay) {
          setMeasurementError("Bildgeometrie ist ungültig.");
          return;
        }
        const ray = new Raycaster(photoRay.origin, photoRay.direction);
        (ray as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
        let hit: { point: Vector3 } | null =
          surfacePicker?.intersectSurface(
            ray,
            [pose.longitude, pose.latitude],
            surfaceMode
          ) ?? null;
        if (!surfacePicker) {
          const meshes: Mesh[] = [];
          for (const runtime of getSharedThreeSceneRuntimes(map)) {
            if (
              !runtime.root.visible ||
              !(
                runtime.receivesScreenImages ||
                runtime.receivesMapStyleTexture ||
                runtime.providesTerrain
              )
            )
              continue;
            // Detailed 3D tiles can also provide terrain heights. Match the
            // shared picker's raster-DEM markers, not that broader capability.
            const isDem =
              typeof (runtime as Partial<RasterDemTerrainRuntime>)
                .getPublishedTerrainTiles === "function" ||
              runtime.root.getObjectByProperty("isMesh", true)?.userData
                .isShadowTerrainSurface === true;
            if (
              (surfaceMode === "mesh" && isDem) ||
              (surfaceMode === "terrain" && !isDem)
            )
              continue;
            runtime.root.traverseVisible((object) => {
              const mesh = object as Mesh;
              if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
            });
          }
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
    [map, surfacePicker, surfaceMode, measuring, sphere.center]
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
      className="oblique-object-coverage"
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
        paddingTop: embedded ? 2 : "calc(4rem + env(safe-area-inset-top))",
      }}
    >
      <div className="oblique-object-coverage-grid">
        {DIRECTIONS.map(({ direction, label }, index) => (
          <CoverageQuadrant
            key={`${direction}:${sphereKey}`}
            label={label}
            corner={
              (
                [
                  "bottom-right",
                  "bottom-left",
                  "top-right",
                  "top-left",
                ] as const
              )[index]
            }
            sphere={sphere}
            images={groups.get(direction) ?? EMPTY_IMAGES}
            loading={loading}
            measuring={measuring}
            points={points}
            onMeasure={onMeasure}
            onFinish={() => setMeasuring(false)}
            onOpen={onOpen}
            pool={imagePool}
            thumbnailPool={thumbnailPool}
          />
        ))}
      </div>
      <div
        className="oblique-object-coverage-tools"
        role="toolbar"
        aria-label="Objektansichten-Werkzeuge"
      >
        <span className="oblique-object-coverage-title">
          <FontAwesomeIcon icon={faImage} /> Objektansichten
        </span>
        <Tooltip title={measuring ? "Messung beenden" : "Strecke messen"}>
          <Button
            size="small"
            aria-label={measuring ? "Messung beenden" : "Strecke messen"}
            aria-pressed={measuring}
            type={measuring ? "primary" : "default"}
            disabled={!map}
            icon={<FontAwesomeIcon icon={measuring ? faBan : faRuler} />}
            onClick={() => {
              setMeasuring((value) => !value);
              setMeasurementError(null);
            }}
          />
        </Tooltip>
        {points.length > 0 && (
          <>
            <span className="oblique-object-coverage-distance">
              {distance.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m
            </span>
            <Tooltip title="Letzten Punkt entfernen">
              <Button
                size="small"
                aria-label="Letzten Punkt entfernen"
                icon={<FontAwesomeIcon icon={faRotateLeft} />}
                onClick={() => setPoints((value) => value.slice(0, -1))}
              />
            </Tooltip>
            <Tooltip title="Messung löschen">
              <Button
                size="small"
                aria-label="Messung löschen"
                icon={<FontAwesomeIcon icon={faTrashCan} />}
                onClick={() => {
                  setPoints([]);
                  setMeasurementError(null);
                }}
              />
            </Tooltip>
          </>
        )}
        {onReset && (
          <Tooltip title="Kugel neu wählen">
            <Button
              size="small"
              aria-label="Kugel neu wählen"
              icon={<FontAwesomeIcon icon={faCrosshairs} />}
              onClick={onReset}
            />
          </Tooltip>
        )}
        {windowActions}
        {onCancel && !windowActions && (
          <Tooltip title="Schließen">
            <Button
              size="small"
              aria-label="Schließen"
              icon={<FontAwesomeIcon icon={faXmark} />}
              onClick={onCancel}
            />
          </Tooltip>
        )}
        {measurementError && (
          <span role="status" className="oblique-object-coverage-error">
            {measurementError}
          </span>
        )}
      </div>
    </div>
  );
};
