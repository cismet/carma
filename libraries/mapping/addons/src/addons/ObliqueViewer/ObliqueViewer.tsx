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
} from "./config";
import { useActiveDirection } from "./hooks/useActiveDirection";
import { useFootprintLayer } from "./hooks/useFootprintLayer";
import { useNearestImage } from "./hooks/useNearestImage";
import { useObliqueCameraMode } from "./hooks/useObliqueCameraMode";
import { useObliqueData } from "./hooks/useObliqueData";
import { useObliqueViewerActions, type ObliqueRequest } from "./oblique-actions";
import { strings } from "./strings.de";
import type { CardinalDirection, NearestObliqueImageRecord } from "./types";
import { getImageUrls } from "./utils/imageUrls";
import { nearestStripBearingDeg, turnTo } from "./utils/obliqueCamera";
import {
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
 * requests: turning to another sector, flying to the image, stepping to a
 * sibling. It draws no panel of its own: the row in the layer bar and the
 * ribbon under it live in the host and read the `obliqueViewer` channel.
 */

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";

export const ObliqueViewer = ({
  config = {},
  libreMap,
}: AddonComponentProps<"obliqueViewer">) => {
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;
  const dataset = useMemo(() => resolveDataset(config), [config]);
  const converter = useMemo(
    () => getProj4Converter(dataset.crs, "EPSG:4326"),
    [dataset.crs]
  );

  const {
    isOn,
    panelOpen,
    previewVisible,
    isBusy,
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
  const { phase } = useObliqueCameraMode({
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
  useEffect(() => {
    if (!running) setBusy(false);
  }, [running, setBusy]);

  // the image under the map centre
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  useEffect(() => {
    if (!running) setSelectedImage(null);
  }, [running]);
  const selectedImageId = selectedImage?.record.id ?? null;

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
    busy: isBusy,
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
    for (const key of Object.keys(siblings)) {
      const direction = Number(key) as CardinalDirection;
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

  /** turn around the centre to a sector's strip heading */
  const turnToDirection = useCallback(
    (direction: CardinalDirection) => {
      if (!libreMap || busyRef.current) return;
      const bearing = radToDeg(
        zeroToTwoPi(
          getHeadingFromCardinalDirection(direction) +
            degToRad(dataset.headingOffsetDeg)
        )
      );
      setBusy(true);
      publish({ activeDirection: direction });
      turnTo(libreMap, bearing, dataset.animations.rotateCamera).done.then(() => {
        setBusy(false);
        refreshSearch({ immediate: true });
      });
    },
    [libreMap, dataset, setBusy, publish, refreshSearch]
  );

  const currentDirection = useCallback((): CardinalDirection => {
    const bearing = libreMap?.getBearing() ?? 0;
    const strip = nearestStripBearingDeg(bearing, dataset.headingOffsetDeg);
    const headingRad = degToRad(strip) - degToRad(dataset.headingOffsetDeg);
    return (Math.round(zeroToTwoPi(headingRad) / (Math.PI / 2)) % 4) as CardinalDirection;
  }, [libreMap, dataset.headingOffsetDeg]);

  // the ribbon's commands
  const handledRequestRef = useRef(0);
  useEffect(() => {
    if (!request || request.seq === handledRequestRef.current) return;
    handledRequestRef.current = request.seq;
    clearRequest(request.seq);
    if (!browsing) return;
    const command: ObliqueRequest = request;
    switch (command.type) {
      case "rotate":
        turnToDirection(rotateCardinal(currentDirection(), command.clockwise));
        break;
      case "rotateTo":
        turnToDirection(command.direction);
        break;
      default:
        // flights and the preview arrive with the overlay
        break;
    }
  }, [request, browsing, clearRequest, turnToDirection, currentDirection]);

  if (!libreMap || !showControl) {
    return null;
  }

  return (
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
  );
};
