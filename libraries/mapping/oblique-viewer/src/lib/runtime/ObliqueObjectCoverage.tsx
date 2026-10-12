import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faChevronDown,
  faImage,
  faLink,
  faLinkSlash,
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
import { sceneToPresentationPoint } from "../core/utils/photo-center-rays";
import { getOrComputeObliquePose } from "../core/utils/oblique-pose";
import {
  createObjectCoverageView,
  objectCoverageViewCrop,
  type ObjectCoverageView,
} from "../core/utils/object-coverage-navigation";
import {
  findObjectCoverageNeighbors,
  objectCoverageHeadingLabel,
  type ObjectCoverageArrow,
} from "../core/utils/object-coverage-neighbors";
import { projectObjectCoverageOutline } from "../core/utils/object-coverage-outline";
import { useObjectPhotoNavigation } from "./hooks/useObjectPhotoNavigation";
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
      className="oblique-object-compass oblique-object-compass-inline"
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
  viewport: { width: number; height: number; pixelRatio?: number },
  sphere?: ObjectCoverageSphere,
  view?: ObjectCoverageView
) => {
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const pixelRatio = viewport.pixelRatio ?? (globalThis.devicePixelRatio || 1);
  // Calibration and measurement coordinates stay in the original sensor frame.
  const finestSourceDensity =
    2 ** -Number(image.dataset.minimumPreviewQualityLevel ?? "0");
  const baseCrop = fitObjectCoverageCrop(
    image.crop,
    {
      width: Math.max(1, viewport.width) as CssPixels,
      height: Math.max(1, viewport.height) as CssPixels,
    },
    pixelRatio as Ratio,
    finestSourceDensity as Ratio
  );
  const requested =
    sphere && view
      ? objectCoverageViewCrop(image, sphere, baseCrop, view)
      : null;
  // Interactive magnification changes display scale; the pool still caps native image requests.
  const crop = requested ?? baseCrop;
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
    const { crop } = thumbnail;
    const fallback = `ellipse(${(image.crop.width / crop.width) * 50}% ${
      (image.crop.height / crop.height) * 50
    }% at 50% 50%)`;
    const pixels = projectObjectCoverageOutline(
      image,
      sphere,
      new Vector3(0, sphere.center.heightMeters, 0),
      sphere.radiusMeters
    );
    if (!pixels) return fallback;
    const outline = pixels.map(
      (pixel) =>
        `${((pixel.x - crop.x) / crop.width) * 100}% ${
          ((pixel.y - crop.y) / crop.height) * 100
        }%`
    );
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

type ObjectRegionDraft = {
  center: Vector3;
  radiusMeters: number;
  edge: Vector3 | null;
};
type ObjectPhotoHover = (
  image: ObjectCoverageImage,
  pixel: { x: number; y: number },
  owner: Window
) => void;

const CoverageRegionDraft = ({
  image,
  sphere,
  draft,
  crop,
  viewport,
  outlineColor,
}: {
  image: ObjectCoverageImage;
  sphere: ObjectCoverageSphere;
  draft: ObjectRegionDraft;
  crop: ObjectCoverageImage["crop"];
  viewport: { width: number; height: number };
  outlineColor: string;
}) => {
  const geometry = useMemo(() => {
    if (!image.projection) return null;
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const center = projectObjectCoveragePoint(
      image.projection,
      draft.center,
      calibration
    );
    if (!center) return null;
    return {
      center,
      edge:
        draft.edge &&
        projectObjectCoveragePoint(image.projection, draft.edge, calibration),
      outline: projectObjectCoverageOutline(
        image,
        sphere,
        draft.center,
        draft.radiusMeters
      ),
    };
  }, [image, sphere, draft]);
  if (!geometry) return null;
  const display = (pixel: { x: number; y: number }) => ({
    x: ((pixel.x - crop.x) * viewport.width) / crop.width,
    y: ((pixel.y - crop.y) * viewport.height) / crop.height,
  });
  const center = display(geometry.center);
  const edge = geometry.edge && display(geometry.edge);
  return (
    <svg
      data-test-id="oblique-coverage-region-draft"
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
      {geometry.outline && (
        <polygon
          data-test-id="oblique-coverage-sphere"
          points={geometry.outline
            .map((pixel) => {
              const p = display(pixel);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          fill="#267bdc"
          fillOpacity={0.3}
          stroke={outlineColor}
          strokeWidth={1}
        />
      )}
      <path
        data-test-id="oblique-coverage-draft-center"
        d={`M ${center.x - 7} ${center.y} h 14 M ${center.x} ${
          center.y - 7
        } v 14`}
        stroke="#fff"
        strokeWidth={4}
      />
      <path
        d={`M ${center.x - 7} ${center.y} h 14 M ${center.x} ${
          center.y - 7
        } v 14`}
        stroke="#267bdc"
        strokeWidth={2}
      />
      {edge && draft.radiusMeters >= 0.1 && (
        <>
          <line
            x1={center.x}
            y1={center.y}
            x2={edge.x}
            y2={edge.y}
            stroke="#fff"
            strokeWidth={3}
          />
          <line
            x1={center.x}
            y1={center.y}
            x2={edge.x}
            y2={edge.y}
            stroke="#267bdc"
            strokeWidth={1.5}
          />
          <text
            x={(center.x + edge.x) / 2}
            y={(center.y + edge.y) / 2 - 7}
            textAnchor="middle"
            fill="#fff"
            stroke="#0f172a"
            strokeWidth={3}
            paintOrder="stroke"
            fontSize={12}
          >
            {draft.radiusMeters.toLocaleString("de-DE", {
              maximumFractionDigits: 2,
            })}{" "}
            m
          </text>
        </>
      )}
    </svg>
  );
};

const CoveragePhoto = ({
  image,
  viewport,
  sphere,
  view,
  selecting,
  regionDraft,
  outlineColor,
  onHoverPoint,
  onSelectPoint,
  onNavigate,
  onActivate,
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
  sphere: ObjectCoverageSphere;
  view: ObjectCoverageView;
  selecting: boolean;
  regionDraft: ObjectRegionDraft | null;
  outlineColor: string;
  onHoverPoint: ObjectPhotoHover;
  onSelectPoint: (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => void;
  onNavigate: (view: ObjectCoverageView) => void;
  onActivate: () => void;
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
    viewport,
    sphere,
    view
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ImageViewportHandle | null>(null);
  const frameRectRef = useRef<NativePreviewWindow["source"] | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const viewportReady = viewport.width > 1 && viewport.height > 1;
  const navigation = useObjectPhotoNavigation({
    image,
    sphere,
    crop,
    view,
    enabled: active,
    onChange: onNavigate,
    onActivate,
  });
  const placeCanvas = () => {
    const rect = frameRectRef.current,
      canvas = canvasRef.current,
      display = cropRef.current;
    if (!rect || !canvas) return;
    Object.assign(canvas.style, {
      left: `${(100 * (rect.x - display.x)) / display.width}%`,
      top: `${(100 * (rect.y - display.y)) / display.height}%`,
      width: `${(100 * rect.width) / display.width}%`,
      height: `${(100 * rect.height) / display.height}%`,
    });
  };
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
    handleRef.current = handle;
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
        frameRectRef.current = frame.source;
        placeCanvas();
      }
    });

    return () => {
      unsubscribe();
      handleRef.current = null;
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
    viewportReady,
    dataset.minimumPreviewQualityLevel,
  ]);

  useEffect(() => {
    placeCanvas();
    handleRef.current?.setViewport(window);
  }, [
    image,
    pool,
    active,
    workerSupported,
    previewUrl,
    viewport.width,
    viewport.height,
    window.source.x,
    window.source.y,
    window.source.width,
    window.source.height,
    window.target.width,
    window.target.height,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
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
      onPointerDown={navigation.onPointerDown}
      onPointerMove={(event) => {
        navigation.onPointerMove(event);
        if (!active || !selecting || event.buttons !== 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        const owner = event.currentTarget.ownerDocument.defaultView;
        if (owner && box.width > 0 && box.height > 0)
          onHoverPoint(
            image,
            {
              x: crop.x + ((event.clientX - box.left) * crop.width) / box.width,
              y:
                crop.y + ((event.clientY - box.top) * crop.height) / box.height,
            },
            owner
          );
      }}
      onPointerUp={navigation.onPointerUp}
      onPointerCancel={navigation.onPointerCancel}
      onLostPointerCapture={navigation.onLostPointerCapture}
      ref={navigation.attachSurface}
      onClick={(event) => {
        if (navigation.consumeDragClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!active || (!measuring && !selecting) || event.detail > 1) return;
        const box = event.currentTarget.getBoundingClientRect();
        (selecting ? onSelectPoint : onMeasure)(image, {
          x: crop.x + ((event.clientX - box.left) * crop.width) / box.width,
          y: crop.y + ((event.clientY - box.top) * crop.height) / box.height,
        });
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        if (selecting) return;
        if (measuring) onFinish();
        else onOpen(record.id);
      }}
      onKeyDown={(event) => {
        if (
          !measuring &&
          !selecting &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onOpen(record.id);
        }
      }}
      title={
        selecting
          ? "Zentrum oder Randpunkt des Ausschnitts wählen"
          : measuring
          ? "Oberflächenpunkt messen; Doppelklick beendet die Strecke"
          : "Doppelklick öffnet das Bild im Hauptfenster"
      }
      style={{
        height: viewport.height,
        width: viewport.width,
        position: "relative",
        overflow: "hidden",
        background: "#0f172a",
        cursor: measuring || selecting ? "crosshair" : "grab",
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
      {active && regionDraft && (
        <CoverageRegionDraft
          image={image}
          sphere={sphere}
          draft={regionDraft}
          crop={crop}
          viewport={viewport}
          outlineColor={outlineColor}
        />
      )}
      {active && !selecting && points.length > 0 && (
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
  reserveWindowActions,
  sphere,
  view,
  selecting,
  regionDraft,
  outlineColor,
  onHoverPoint,
  onSelectPoint,
  onNavigate,
  onActivate,
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
  reserveWindowActions: boolean;
  sphere: ObjectCoverageSphere;
  view: ObjectCoverageView;
  selecting: boolean;
  regionDraft: ObjectRegionDraft | null;
  outlineColor: string;
  onHoverPoint: ObjectPhotoHover;
  onSelectPoint: (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => void;
  onNavigate: (view: ObjectCoverageView) => void;
  onActivate: () => void;
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
  const neighbors = useMemo(
    () => (active ? findObjectCoverageNeighbors(active, images, sphere) : {}),
    [active, images, sphere]
  );
  const arrows: readonly ObjectCoverageArrow[] = [
    "up",
    "left",
    "right",
    "down",
  ];
  const alternatives = useMemo(() => Object.values(neighbors), [neighbors]);
  const seriesImages = active
    ? images.filter((image) => image.record.seriesId === active.record.seriesId)
    : [];
  const seriesIndex = active
    ? seriesImages.findIndex((image) => image.record.id === active.record.id)
    : -1;
  const choose = (index: number) => {
    if (index < 0 || index >= images.length) return;
    onActivate();
    enablePreload();
    setActiveIndex(index);
  };
  return (
    <section
      aria-label={`Objektansichtenabfrage ${label}`}
      className="oblique-object-quadrant"
      data-window-actions={reserveWindowActions || undefined}
      data-cardinal={label}
    >
      <div ref={viewportRef} className="oblique-object-photo-viewport">
        {active ? (
          <CoveragePhoto
            key={active.record.id}
            image={active}
            viewport={viewport}
            sphere={sphere}
            view={view}
            selecting={selecting}
            regionDraft={regionDraft}
            outlineColor={outlineColor}
            onHoverPoint={onHoverPoint}
            onSelectPoint={onSelectPoint}
            onNavigate={onNavigate}
            onActivate={onActivate}
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
        <span className="oblique-object-cardinal-label">{label}</span>
        <CoverageCompass image={active} sphere={sphere} />
        <span
          className="oblique-object-heading"
          title="Tatsächliche Blickrichtung und Abweichung von der Hauptrichtung"
        >
          {active
            ? objectCoverageHeadingLabel(
                active,
                ({ N: 0, O: 1, S: 2, W: 3 } as const)[
                  label as "N" | "O" | "S" | "W"
                ]
              )
            : "—"}
        </span>
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
          {seriesImages.length
            ? `${seriesIndex + 1}/${seriesImages.length}`
            : "0 Bilder"}
        </span>
      </div>
      {arrows.map((arrow) => {
        const target = neighbors[arrow];
        if (!target) return null;
        const caption = {
          up: "oben",
          down: "unten",
          left: "links",
          right: "rechts",
        }[arrow];
        const icon = {
          up: faChevronUp,
          down: faChevronDown,
          left: faChevronLeft,
          right: faChevronRight,
        }[arrow];
        return (
          <Tooltip
            key={arrow}
            title={`Nächstes Bild ${caption}: ${target.record.sourceId}`}
          >
            <button
              type="button"
              className="oblique-object-neighbor oblique-object-thumbnail"
              data-direction={arrow}
              data-neighbor-image-id={target.record.id}
              aria-label={`${label}: Bild ${caption}`}
              onMouseEnter={enablePreload}
              onFocus={enablePreload}
              onClick={() =>
                choose(
                  images.findIndex(
                    (image) => image.record.id === target.record.id
                  )
                )
              }
            >
              <CoverageThumbnail
                image={target}
                sphere={sphere}
                pool={thumbnailPool}
              />
              <span
                className="oblique-object-neighbor-arrow"
                aria-hidden="true"
              >
                <FontAwesomeIcon icon={icon} />
              </span>
            </button>
          </Tooltip>
        );
      })}
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
  onRegionChange,
  onRegionDraft,
  outlineColor = "#fff",
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
  onRegionChange?: (sphere: ObjectCoverageSphere) => void;
  onRegionDraft?: (sphere: ObjectCoverageSphere | null) => void;
  outlineColor?: string;
  onCancel?: () => void;
  /** Dialog/window hosts fill the available extent; standalone views clear the main navigation. */
  embedded?: boolean;
}) => {
  const windowActions = useObliqueObjectWindowActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current,
      tools = toolsRef.current;
    if (!root || !tools) return;
    const host = root.closest("[data-oblique-object-window]");
    const resize = () => {
      const value = `${Math.ceil(
        tools.getBoundingClientRect().width / 2 + 12
      )}px`;
      if (
        root.style.getPropertyValue("--oblique-object-tools-half-width") !==
        value
      )
        root.style.setProperty("--oblique-object-tools-half-width", value);
    };
    let observer: ResizeObserver | undefined;
    let owner: (Window & typeof globalThis) | null = null;
    const observe = () => {
      observer?.disconnect();
      owner?.removeEventListener("resize", resize);
      owner = root.ownerDocument.defaultView as
        | (Window & typeof globalThis)
        | null;
      observer = owner?.ResizeObserver
        ? new owner.ResizeObserver(resize)
        : undefined;
      observer?.observe(tools);
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
  const [synchronised, setSynchronised] = useState(true);
  const [sharedView, setSharedView] = useState(() =>
    createObjectCoverageView(sphere)
  );
  const [localViews, setLocalViews] = useState<
    Partial<Record<CardinalDirection, ObjectCoverageView>>
  >({});
  const lastDirection = useRef<CardinalDirection>(0);
  const [redefining, setRedefining] = useState<"center" | "radius" | null>(
    null
  );
  const [draftCenter, setDraftCenter] = useState<Vector3 | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Vector3 | null>(null);
  const onNavigate = (
    direction: CardinalDirection,
    view: ObjectCoverageView
  ) => {
    lastDirection.current = direction;
    if (synchronised) setSharedView(view);
    else setLocalViews((previous) => ({ ...previous, [direction]: view }));
  };
  const toggleSynchronised = () => {
    if (synchronised)
      setLocalViews({
        0: sharedView,
        1: sharedView,
        2: sharedView,
        3: sharedView,
      });
    else setSharedView(localViews[lastDirection.current] ?? sharedView);
    setSynchronised((value) => !value);
  };
  const sphereKey = `${sphere.center.longitude}|${sphere.center.latitude}|${sphere.center.heightMeters}|${sphere.radiusMeters}`;
  useEffect(() => {
    setPoints([]);
    setMeasuring(false);
    setMeasurementError(null);
    setRedefining(null);
    setDraftCenter(null);
    setHoverPoint(null);
    setSharedView(createObjectCoverageView(sphere));
    setLocalViews({});
  }, [sphereKey, surfaceMode]);
  const readPhotoPoint = useCallback(
    (
      image: ObjectCoverageImage,
      pixel: { x: number; y: number },
      quiet = false
    ) => {
      const reportError = (error: string | null) => {
        if (!quiet) setMeasurementError(error);
      };
      if (!map) return;
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
      const pose = getOrComputeObliquePose(image.record, image.dataset),
        altitude = image.cameraAltitudeMeters;
      if (!pose || altitude === undefined) {
        reportError("Bildorientierung fehlt");
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
          reportError("Bildgeometrie ist ungültig.");
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
          reportError(
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
        reportError(null);
        return physical;
      } finally {
        lease.release();
      }
    },
    [map, surfacePicker, surfaceMode, sphere.center]
  );
  const hoverOptions = useRef({ redefining, readPhotoPoint });
  hoverOptions.current = { redefining, readPhotoPoint };
  const pendingHover = useRef<{
    image: ObjectCoverageImage;
    pixel: { x: number; y: number };
    owner: Window;
  } | null>(null);
  const hoverFrame = useRef<{ owner: Window; id: number } | null>(null);
  const hoverOwner = useRef<Window | null>(null);
  const lastHoverTime = useRef(-Infinity);
  const cancelHover = useCallback(() => {
    if (hoverFrame.current)
      hoverFrame.current.owner.cancelAnimationFrame(hoverFrame.current.id);
    hoverFrame.current = null;
    hoverOwner.current = null;
    pendingHover.current = null;
    lastHoverTime.current = -Infinity;
  }, []);
  useEffect(() => {
    cancelHover();
    const host = rootRef.current?.closest("[data-oblique-object-window]");
    host?.addEventListener("oblique-object-window-change", cancelHover);
    return () => {
      cancelHover();
      host?.removeEventListener("oblique-object-window-change", cancelHover);
    };
  }, [redefining, cancelHover]);
  const onHoverPoint = useCallback<ObjectPhotoHover>(
    (image, pixel, owner) => {
      if (!hoverOptions.current.redefining) return;
      if (hoverOwner.current !== owner) cancelHover();
      hoverOwner.current = owner;
      pendingHover.current = { image, pixel, owner };
      if (hoverFrame.current) return;
      const update = (time: number) => {
        const pending = pendingHover.current;
        if (!pending || !hoverOptions.current.redefining) {
          cancelHover();
          return;
        }
        // One shared surface pick, at most 30 Hz; projection into the four photos needs no ray casts.
        if (time - lastHoverTime.current < 1000 / 30) {
          hoverFrame.current = {
            owner: pending.owner,
            id: pending.owner.requestAnimationFrame(update),
          };
          return;
        }
        hoverFrame.current = null;
        pendingHover.current = null;
        lastHoverTime.current = time;
        const point = hoverOptions.current.readPhotoPoint(
          pending.image,
          pending.pixel,
          true
        );
        setHoverPoint(point ?? null);
      };
      hoverFrame.current = { owner, id: owner.requestAnimationFrame(update) };
    },
    [cancelHover]
  );
  const regionDraft = useMemo<ObjectRegionDraft | null>(() => {
    if (!redefining) return null;
    const center = draftCenter ?? hoverPoint;
    if (!center) return null;
    return {
      center,
      radiusMeters:
        redefining === "radius"
          ? hoverPoint
            ? center.distanceTo(hoverPoint)
            : sphere.radiusMeters
          : 0,
      edge: draftCenter ? hoverPoint : null,
    };
  }, [redefining, draftCenter, hoverPoint, sphere.radiusMeters]);
  useEffect(() => {
    const center =
      regionDraft &&
      regionDraft.radiusMeters >= 0.1 &&
      sceneToPresentationPoint(
        regionDraft.center,
        [sphere.center.longitude, sphere.center.latitude],
        new Matrix4()
      );
    onRegionDraft?.(
      center && Object.values(center).every(Number.isFinite)
        ? { center, radiusMeters: regionDraft!.radiusMeters }
        : null
    );
  }, [
    regionDraft,
    onRegionDraft,
    sphere.center.longitude,
    sphere.center.latitude,
  ]);
  useEffect(() => () => onRegionDraft?.(null), [onRegionDraft]);
  const onMeasure = useCallback(
    (image: ObjectCoverageImage, pixel: { x: number; y: number }) => {
      if (!measuring) return;
      const physical = readPhotoPoint(image, pixel);
      if (physical) setPoints((previous) => [...previous, physical]);
    },
    [measuring, readPhotoPoint]
  );
  const onSelectPoint = (
    image: ObjectCoverageImage,
    pixel: { x: number; y: number }
  ) => {
    if (!redefining || !onRegionChange) return;
    const physical = readPhotoPoint(image, pixel);
    if (!physical) return;
    cancelHover();
    setHoverPoint(null);
    if (redefining === "center") {
      setDraftCenter(physical);
      setRedefining("radius");
      return;
    }
    if (!draftCenter) return;
    const radiusMeters = physical.distanceTo(draftCenter);
    if (!(radiusMeters >= 0.1 && Number.isFinite(radiusMeters))) {
      setMeasurementError(
        "Der Randpunkt muss mindestens 10 cm vom Zentrum entfernt sein."
      );
      return;
    }
    const center = sceneToPresentationPoint(
      draftCenter,
      [sphere.center.longitude, sphere.center.latitude],
      new Matrix4()
    );
    if (!Object.values(center).every(Number.isFinite)) return;
    onRegionChange({ center, radiusMeters });
    onRegionDraft?.(null);
    setRedefining(null);
    setDraftCenter(null);
  };
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
      ref={rootRef}
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
        paddingTop: embedded ? 0 : "calc(4rem + env(safe-area-inset-top))",
      }}
    >
      <div className="oblique-object-coverage-grid">
        {DIRECTIONS.map(({ direction, label }, index) => (
          <CoverageQuadrant
            key={`${direction}:${sphereKey}`}
            label={label}
            reserveWindowActions={index === 1 && Boolean(windowActions)}
            sphere={sphere}
            view={
              synchronised ? sharedView : localViews[direction] ?? sharedView
            }
            selecting={redefining !== null}
            regionDraft={regionDraft}
            outlineColor={outlineColor}
            onHoverPoint={onHoverPoint}
            onSelectPoint={onSelectPoint}
            onNavigate={(view) => onNavigate(direction, view)}
            onActivate={() => {
              lastDirection.current = direction;
            }}
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
        ref={toolsRef}
        className="oblique-object-coverage-tools"
        role="toolbar"
        aria-label="Objektansichten-Werkzeuge"
      >
        <span className="oblique-object-coverage-title">
          <FontAwesomeIcon icon={faImage} />{" "}
          {redefining === "center"
            ? "Zentrum in einem Bild wählen"
            : redefining === "radius"
            ? "Randpunkt in einem Bild wählen"
            : "Objektansichten"}
        </span>
        <div className="oblique-object-coverage-actions">
          <Tooltip
            title={
              synchronised
                ? "Pan und Zoom sind in allen Ansichten gekoppelt"
                : "Aktive Ansicht auf alle Ansichten übertragen"
            }
          >
            <Button
              size="small"
              aria-label="Ansichten synchronisieren"
              aria-pressed={synchronised}
              type={synchronised ? "primary" : "default"}
              icon={
                <FontAwesomeIcon icon={synchronised ? faLink : faLinkSlash} />
              }
              onClick={toggleSynchronised}
            />
          </Tooltip>
          <Tooltip title={measuring ? "Messung beenden" : "Strecke messen"}>
            <Button
              size="small"
              aria-label={measuring ? "Messung beenden" : "Strecke messen"}
              aria-pressed={measuring}
              type={measuring ? "primary" : "default"}
              disabled={!map}
              icon={<FontAwesomeIcon icon={measuring ? faBan : faRuler} />}
              onClick={() => {
                setRedefining(null);
                setDraftCenter(null);
                setMeasuring((value) => !value);
                setMeasurementError(null);
              }}
            />
          </Tooltip>
          {points.length > 0 && (
            <>
              <span className="oblique-object-coverage-distance">
                {distance.toLocaleString("de-DE", { maximumFractionDigits: 2 })}{" "}
                m
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
          {(onReset || onRegionChange) && (
            <Tooltip
              title={
                redefining
                  ? "Neudefinition abbrechen"
                  : "Zentrum und Ausschnitt in einem Bild neu definieren"
              }
            >
              <Button
                size="small"
                aria-label={
                  redefining
                    ? "Neudefinition abbrechen"
                    : "Zentrum und Ausschnitt neu definieren"
                }
                aria-pressed={redefining !== null}
                type={redefining ? "primary" : "default"}
                icon={<FontAwesomeIcon icon={faCrosshairs} />}
                onClick={() => {
                  if (!onRegionChange) {
                    onReset?.();
                    return;
                  }
                  cancelHover();
                  setHoverPoint(null);
                  setRedefining((value) => (value ? null : "center"));
                  setDraftCenter(null);
                  setMeasuring(false);
                  setMeasurementError(null);
                }}
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
        </div>
        {measurementError && (
          <span role="status" className="oblique-object-coverage-error">
            {measurementError}
          </span>
        )}
      </div>
    </div>
  );
};
