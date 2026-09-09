import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import { getProj4Converter } from "@carma-geo/proj";
import { Control, ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  resolveDataset,
  type ObliqueViewerConfig,
} from "./config";
import { useActiveDirection } from "./hooks/useActiveDirection";
import { useFootprintLayer } from "./hooks/useFootprintLayer";
import { useFovWheelZoom } from "./hooks/useFovWheelZoom";
import { useNearestImage } from "./hooks/useNearestImage";
import { useObliqueCameraMode } from "./hooks/useObliqueCameraMode";
import { useObliqueData } from "./hooks/useObliqueData";
import { useObliqueDirectionKeybindings } from "./hooks/useObliqueDirectionKeybindings";
import { useObliqueViewerActions } from "./oblique-actions";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueOverlay } from "./ObliqueOverlay";
import { strings } from "./strings.de";
import type {
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueImageRecord,
} from "./types";
import {
  flyToPose,
  poseOf,
  resolveCameraAltitude,
  restoreCenterOnGround,
  settleToPitch,
} from "./utils/flyToImage";
import { getImageUrls, prefetchSiblingPreviewFor } from "./utils/imageUrls";
import { nearestStripBearingDeg, turnTo } from "./utils/obliqueCamera";
import {
  CARDINALS_CLOCKWISE,
  degToRad,
  getHeadingFromCardinalDirection,
  radToDeg,
  rotateCardinal,
  zeroToTwoPi,
} from "./utils/orientation";
import {
  computeSiblingsByCardinal,
  emptySiblingsByCardinal,
} from "./utils/siblings";

/**
 * The engine of the Schrägluftbild viewer on the MapLibre map.
 *
 * While on, it loads the flight's metadata, tilts the map into the oblique
 * view, finds the image nearest the map centre in the sector the camera
 * looks into, draws that image's footprint, and answers the ribbon's
 * requests: turning to another sector, flying to the image and showing it
 * as a preview aligned with the camera, stepping to a sibling. It draws no
 * panel of its own: the row in the layer bar and the ribbon under it live
 * in the host and read the `obliqueViewer` channel.
 */

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";

/** a key press is taken after the last of a quick run of them */
const SIBLING_MOVE_DEBOUNCE_MS = 200;

/**
 * One object for "no config", so a bare declaration resolves to one dataset
 * rather than a fresh one per render, which would restart every effect
 * keyed on it.
 */
const EMPTY_CONFIG: ObliqueViewerConfig = {};

/** a record as the selection, the way the nearest search reports one */
const recordAsSelection = (
  record: ObliqueImageRecord
): NearestObliqueImageRecord => ({
  record,
  distanceOnGround: 0,
  distanceToCamera: 0,
  imageCenter: {
    x: record.x,
    y: record.y,
    longitude: record.centerWGS84[0],
    latitude: record.centerWGS84[1],
    cardinal: record.sector,
  },
});

export const ObliqueViewer = ({
  config,
  libreMap,
}: AddonComponentProps<"obliqueViewer">) => {
  const viewerConfig = config ?? EMPTY_CONFIG;
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    heightDatum = "dhhn2016",
    heightOffset = 0,
  } = viewerConfig;
  const dataset = useMemo(() => resolveDataset(viewerConfig), [viewerConfig]);
  const converter = useMemo(
    () => getProj4Converter(dataset.crs, "EPSG:4326"),
    [dataset.crs]
  );

  const {
    isOn,
    panelOpen,
    previewVisible,
    isBusy,
    previewQuality,
    backdropLook,
    activeDirection,
    request,
    toggle,
    publish,
    clearRequest,
  } = useObliqueViewerActions();

  const running = isOn && libreMap !== null;

  // the flight's metadata, fetched once and kept
  const { data, isLoading, isAllDataReady, error } = useObliqueData(
    dataset,
    converter,
    running
  );
  useEffect(() => {
    publish({ isLoading, isAllDataReady, error });
  }, [publish, isLoading, isAllDataReady, error]);

  // the camera: tilted in while on, handed back when off
  const { phase, freeCamera, lockCamera } = useObliqueCameraMode({
    map: libreMap,
    enabled: running,
    dataset,
  });
  const browsing = running && phase === "active";

  // a turn or a flight under way; the ribbon holds its buttons meanwhile
  const busyRef = useRef(false);
  const setBusy = useCallback(
    (next: boolean) => {
      busyRef.current = next;
      publish({ isBusy: next });
    },
    [publish]
  );
  const previewVisibleRef = useRef(previewVisible);
  previewVisibleRef.current = previewVisible;

  // the image under the map centre, or the one flown to
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const selectedImageRef = useRef(selectedImage);
  selectedImageRef.current = selectedImage;
  const selectedImageId = selectedImage?.record.id ?? null;
  /** the preview image is hidden while a flight to the next one runs */
  const [dimImage, setDimImage] = useState(false);
  /** the last sibling step's direction, to prefetch one further on arrival */
  const lastMoveDirRef = useRef<CardinalDirection | null>(null);

  useEffect(() => {
    if (running) return;
    setSelectedImage(null);
    setDimImage(false);
    setBusy(false);
  }, [running, setBusy]);

  const refreshSearch = useNearestImage({
    map: libreMap,
    enabled: browsing && !isBusy,
    dataset,
    data,
    converter,
    locked: previewVisible || isBusy,
    selectedImageId,
    onSelect: setSelectedImage,
  });

  const previewQualityLevel =
    previewQuality === "hq" ? dataset.hqQualityLevel : dataset.previewQualityLevel;

  const { downloadUrl } = useMemo(
    () =>
      getImageUrls(
        selectedImageId ?? undefined,
        dataset.previewPath,
        dataset.previewQualityLevel,
        dataset.downloadQualityLevel
      ),
    [selectedImageId, dataset]
  );
  useEffect(() => {
    publish({
      selectedImageId,
      selectedCameraId: selectedImage?.record.cameraId ?? null,
      downloadUrl,
    });
  }, [publish, selectedImageId, selectedImage, downloadUrl]);

  // the sector the camera looks into
  const onDirectionChange = useCallback(
    (direction: CardinalDirection | null) => publish({ activeDirection: direction }),
    [publish]
  );
  useActiveDirection({
    map: libreMap,
    enabled: browsing,
    headingOffsetDeg: dataset.headingOffsetDeg,
    busy: isBusy || previewVisible,
    onChange: onDirectionChange,
  });

  // the neighbours of the selected image
  const siblings = useMemo(
    () =>
      selectedImage && data
        ? computeSiblingsByCardinal(selectedImage.record, data.imageRecords)
        : emptySiblingsByCardinal(),
    [selectedImage, data]
  );
  useEffect(() => {
    const siblingIds: Partial<Record<CardinalDirection, string>> = {};
    for (const direction of CARDINALS_CLOCKWISE) {
      const sibling = siblings[direction];
      if (sibling) siblingIds[direction] = sibling.id;
    }
    publish({ siblingIds });
  }, [publish, siblings]);

  // the footprint on the ground
  useFootprintLayer({
    map: libreMap,
    enabled: running,
    footprintData: data?.footprintData ?? null,
    selectedImageId,
    locked: previewVisible || isBusy,
    style: dataset.footprintsStyle,
    fadeOut: dataset.animations.outlineFadeOut,
  });

  // the wheel narrows and widens the view instead of zooming
  useFovWheelZoom({
    map: libreMap,
    enabled: browsing,
    minFovDeg: dataset.minFovDeg,
    maxFovDeg: dataset.maxFovDeg,
    busyRef,
  });

  /** fly the camera to an image's pose; settles when it has landed */
  const flyTo = useCallback(
    async (
      record: ObliqueImageRecord,
      animation: typeof dataset.animations.flyToNextImage,
      dynamicDuration: boolean
    ) => {
      if (!libreMap) return;
      setBusy(true);
      freeCamera();
      try {
        const pose = poseOf(record, dataset);
        const altitude = await resolveCameraAltitude(
          record,
          heightDatum,
          heightOffset
        );
        await flyToPose(libreMap, pose, altitude, animation, { dynamicDuration })
          .done;
      } catch (flightError) {
        console.error("[OBLIQUE] the flight to the image failed", flightError);
      } finally {
        setBusy(false);
      }
    },
    [libreMap, dataset, heightDatum, heightOffset, setBusy, freeCamera]
  );

  /** back from an image's pose to browsing: centre on the ground, tilt, lock */
  const settleToBrowsing = useCallback(async () => {
    if (!libreMap) return;
    setBusy(true);
    try {
      restoreCenterOnGround(libreMap);
      await settleToPitch(libreMap, dataset.pitchDeg).done;
      lockCamera();
    } finally {
      setBusy(false);
    }
    refreshSearch({ immediate: true });
  }, [libreMap, dataset.pitchDeg, lockCamera, setBusy, refreshSearch]);

  const closePreview = useCallback(() => {
    if (!previewVisibleRef.current) return;
    publish({ previewVisible: false });
    setDimImage(false);
    void settleToBrowsing();
  }, [publish, settleToBrowsing]);

  const openPreview = useCallback(async () => {
    const record = selectedImageRef.current?.record;
    if (!record || busyRef.current) return;
    await flyTo(record, dataset.animations.flyToExteriorOrientation, true);
    publish({ previewVisible: true });
  }, [flyTo, dataset.animations.flyToExteriorOrientation, publish]);

  /** step to a neighbour: the image goes dark, the camera hops, the next fades in */
  const goToSibling = useCallback(
    async (direction: CardinalDirection) => {
      const current = selectedImageRef.current?.record;
      if (!current || !data || busyRef.current) return;
      const candidate = computeSiblingsByCardinal(current, data.imageRecords)[
        direction
      ];
      if (!candidate) return;
      lastMoveDirRef.current = direction;
      const withPreview = previewVisibleRef.current;
      if (withPreview) setDimImage(true);
      setSelectedImage(recordAsSelection(candidate));
      await flyTo(candidate, dataset.animations.flyToNextImage, true);
      if (withPreview) {
        setDimImage(false);
        prefetchSiblingPreviewFor(
          candidate.id,
          direction,
          data.imageRecords,
          dataset.previewPath,
          previewQualityLevel
        );
      } else {
        await settleToBrowsing();
      }
    },
    [data, dataset, flyTo, settleToBrowsing, previewQualityLevel]
  );

  // a run of key presses is one step, taken after the last of them
  const pendingMoveRef = useRef<CardinalDirection | null>(null);
  const moveTimerRef = useRef<number | undefined>(undefined);
  const requestSibling = useCallback(
    (direction: CardinalDirection) => {
      pendingMoveRef.current = direction;
      window.clearTimeout(moveTimerRef.current);
      moveTimerRef.current = window.setTimeout(() => {
        const next = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (next !== null) void goToSibling(next);
      }, SIBLING_MOVE_DEBOUNCE_MS);
    },
    [goToSibling]
  );
  useEffect(() => () => window.clearTimeout(moveTimerRef.current), []);

  const siblingCallbacks = useMemo(() => {
    const callbacks: Partial<Record<CardinalDirection, () => void>> = {};
    for (const direction of CARDINALS_CLOCKWISE) {
      if (siblings[direction]) {
        callbacks[direction] = () => requestSibling(direction);
      }
    }
    return callbacks;
  }, [siblings, requestSibling]);

  useObliqueDirectionKeybindings({
    enabled: browsing,
    activeDirection,
    siblingCallbacks,
  });

  /** the sector the camera looks into right now */
  const currentDirection = useCallback((): CardinalDirection => {
    if (activeDirection !== null) return activeDirection;
    const strip = nearestStripBearingDeg(
      libreMap?.getBearing() ?? 0,
      dataset.headingOffsetDeg
    );
    const headingRad = degToRad(strip) - degToRad(dataset.headingOffsetDeg);
    return (Math.round(zeroToTwoPi(headingRad) / (Math.PI / 2)) %
      4) as CardinalDirection;
  }, [activeDirection, libreMap, dataset.headingOffsetDeg]);

  /**
   * Turn to a sector: around the centre while browsing; while the preview
   * is up, to the nearest image of that sector, since the map under the
   * preview has to stay aligned with an image.
   */
  const turnToDirection = useCallback(
    async (direction: CardinalDirection) => {
      if (!libreMap || busyRef.current) return;
      if (previewVisibleRef.current) {
        const nearest = refreshSearch({
          direction,
          immediate: true,
          computeOnly: true,
        })?.[0];
        if (!nearest || nearest.record.id === selectedImageRef.current?.record.id) {
          return;
        }
        lastMoveDirRef.current = direction;
        setDimImage(true);
        publish({ activeDirection: direction });
        setSelectedImage(nearest);
        await flyTo(nearest.record, dataset.animations.flyToRotatedImage, false);
        setDimImage(false);
        return;
      }
      const bearing = radToDeg(
        zeroToTwoPi(
          getHeadingFromCardinalDirection(direction) +
            degToRad(dataset.headingOffsetDeg)
        )
      );
      setBusy(true);
      publish({ activeDirection: direction });
      try {
        await turnTo(libreMap, bearing, dataset.animations.rotateCamera).done;
      } finally {
        setBusy(false);
      }
      refreshSearch({ immediate: true });
    },
    [libreMap, dataset, setBusy, publish, refreshSearch, flyTo]
  );

  // the ribbon's commands
  const handledRequestRef = useRef(0);
  useEffect(() => {
    if (!request || request.seq === handledRequestRef.current) return;
    handledRequestRef.current = request.seq;
    clearRequest(request.seq);
    if (!browsing) return;
    switch (request.type) {
      case "rotate":
        void turnToDirection(rotateCardinal(currentDirection(), request.clockwise));
        break;
      case "rotateTo":
        void turnToDirection(request.direction);
        break;
      case "sibling":
        requestSibling(request.direction);
        break;
      case "flyToImage":
        if (previewVisibleRef.current) {
          closePreview();
        } else {
          void openPreview();
        }
        break;
      case "closePreview":
        closePreview();
        break;
      default:
        break;
    }
  }, [
    request,
    browsing,
    clearRequest,
    turnToDirection,
    currentDirection,
    requestSibling,
    closePreview,
    openPreview,
  ]);

  const selectedRecord = selectedImage?.record ?? null;
  const rollDeg = useMemo(
    () => (selectedRecord ? poseOf(selectedRecord, dataset).rollDeg : 0),
    [selectedRecord, dataset]
  );

  if (!libreMap) {
    return null;
  }

  return (
    <>
      {running && previewVisible && selectedRecord && (
        <ObliqueOverlay map={libreMap}>
          <ObliqueImagePreview
            key={selectedRecord.id}
            map={libreMap}
            previewPath={dataset.previewPath}
            imageId={selectedRecord.id}
            qualityLevel={previewQualityLevel}
            dimImage={dimImage}
            rollDeg={rollDeg}
            interiorOrientationOffsets={
              dataset.interiorOrientationOffsets[selectedRecord.cameraId]
            }
            style={dataset.imagePreviewStyle}
            backdropLook={backdropLook}
            onClose={closePreview}
          />
        </ObliqueOverlay>
      )}
      {showControl && (
        <Control position={controlPosition} order={controlOrder}>
          <Tooltip
            title={isOn ? strings.controlOff : strings.controlOn}
            placement="right"
          >
            <ControlButtonStyler
              onClick={toggle}
              dataTestId="oblique-viewer-control"
            >
              <FontAwesomeIcon
                icon={faImages}
                style={{ color: isOn && panelOpen ? ON_COLOR : OFF_COLOR }}
              />
            </ControlButtonStyler>
          </Tooltip>
        </Control>
      )}
    </>
  );
};
