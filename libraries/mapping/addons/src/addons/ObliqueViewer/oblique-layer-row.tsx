import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlane, faXmark } from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";
import {
  CARDINAL_BEARING_FORM,
  formatCardinalBearing,
} from "@carma-mapping/annotations/runtime";
import { degToRad, radToDeg, zeroToTwoPi } from "@carma-units";

import { useObliqueViewerActions } from "./oblique-actions";
const acquisitionMonth = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const strings = {
  title: "Schrägluftbilder",
  flyToImageTooltip: "Unverzerrte Bildvorschau starten",
  closePreviewTooltip: "Bildvorschau beenden",
  readoutTooltip: "Schrägluftbild-Werkzeuge öffnen",
};

export const OBLIQUE_LAYER_ID = "__obliqueViewer__";

/** the ribbon the row opens, registered by the host */
export const OBLIQUE_TOOLS_INTERACTION_ID = "oblique-viewer-tools";

/** the row's own fly/close button, which acts instead of opening anything */
export const OBLIQUE_FLY_TOGGLE_ID = "oblique-viewer-fly-toggle";

/** blue while the ribbon is open, black while it is not */
export const OBLIQUE_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The row the layer bar shows while the viewer is on: the title, selected photo
 * metadata, and its flight action. Same shape as the
 * flood's and the time series' rows, so a route's tools read as one family.
 */
export const OBLIQUE_LAYER: Layer = {
  id: OBLIQUE_LAYER_ID,
  title: strings.title,
  type: "object",
  icon: "oblique",
  iconColor: OBLIQUE_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: OBLIQUE_TOOLS_INTERACTION_ID,
};

const buildInteractionButtons = ({
  label,
  previewVisible,
  hasImage,
  onFlyToggle,
  hoverAvailable,
}: {
  label: string;
  previewVisible: boolean;
  hasImage: boolean;
  hoverAvailable: boolean;
  onFlyToggle: () => void;
}): InteractionButton[] => {
  const buttons: InteractionButton[] = [
    {
      // same id as `rowClickInteractionId`, so the readout is lit while the
      // ribbon is open and clicking it closes the ribbon again
      id: OBLIQUE_TOOLS_INTERACTION_ID,
      icon: (
        <span className="tabular-nums" style={READOUT_STYLE}>
          {label}
        </span>
      ),
      tooltip: strings.readoutTooltip,
    },
  ];
  if (hasImage && (!hoverAvailable || previewVisible)) {
    buttons.push({
      id: OBLIQUE_FLY_TOGGLE_ID,
      icon: <FontAwesomeIcon icon={previewVisible ? faXmark : faPlane} />,
      tooltip: previewVisible
        ? strings.closePreviewTooltip
        : strings.flyToImageTooltip,
      onClick: onFlyToggle,
    });
  }
  return buttons;
};

export type UseObliqueLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that runs the viewer. A row that
   * outlived its route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  /** whether the host is showing the ribbon */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the viewer in step. The row belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into this library.
 */
export const useObliqueLayerRow = ({
  hasRow,
  hasEngine,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseObliqueLayerRowOptions) => {
  const {
    isOn,
    setOn,
    title,
    series,
    bearingDeg,
    previewVisible,
    selectedImageId,
    selectedSourceImageId,
    selectedSeriesId,
    selectedImageBearingDeg,
    hoverAvailable,
    setPanelOpen,
    sendRequest,
  } = useObliqueViewerActions();

  const imageSeries =
    selectedImageId && selectedSourceImageId
      ? series.find((entry) => entry.enabled && entry.id === selectedSeriesId)
      : undefined;
  const heading = imageSeries
    ? selectedImageBearingDeg ?? bearingDeg
    : bearingDeg;
  const label = useMemo(() => {
    const radians =
      heading !== null && Number.isFinite(heading)
        ? zeroToTwoPi(degToRad(heading))
        : null;
    const angle = radians !== null ? Math.round(radToDeg(radians)) % 360 : null;
    const direction =
      radians !== null
        ? `${formatCardinalBearing(radians, {
            form: CARDINAL_BEARING_FORM.SHORT,
            points: 16,
          })} (${angle}°)`
        : null;
    if (imageSeries) {
      const year = imageSeries.acquisitionYear ?? Number.NaN;
      const month = imageSeries.acquisitionMonth ?? Number.NaN;
      const date =
        Number.isInteger(year) && year >= 1000 && year <= 9999
          ? Number.isInteger(month) && month >= 1 && month <= 12
            ? acquisitionMonth.format(new Date(Date.UTC(year, month - 1, 1)))
            : String(year)
          : imageSeries.shortLabel ?? imageSeries.label;
      return [
        date,
        [direction, selectedSourceImageId].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" - ");
    }
    return [
      series
        .filter((entry) => entry.enabled)
        .map((entry) => entry.shortLabel ?? entry.id)
        .join(", "),
      direction,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [series, imageSeries, heading, selectedSourceImageId]);

  // the app owns the panel state; the row's icon colour reads it from here
  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);

  const layer = useMemo(
    () => ({
      ...OBLIQUE_LAYER,
      title,
      iconColor: panelOpen
        ? OBLIQUE_ICON_COLOR.open
        : OBLIQUE_ICON_COLOR.closed,
      interactionButtons: buildInteractionButtons({
        label,
        previewVisible,
        hasImage: selectedImageId !== null,
        hoverAvailable,
        onFlyToggle: () => sendRequest({ type: "flyToImage" }),
      }),
    }),
    [
      title,
      label,
      previewVisible,
      selectedImageId,
      hoverAvailable,
      panelOpen,
      sendRequest,
    ]
  );

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);
  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // No engine on this route: nothing can run the viewer, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] an oblique viewer row reached a route that mounts no "obliqueViewer" ' +
              "addon; dropping the row. A route that offers the viewer has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(OBLIQUE_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the viewer is still on
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      setOn(false);
      return;
    }

    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }

    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }

    // The viewer restores itself from storage alongside the row, so a row
    // that came back from the host's persistence normally finds `isOn` true.
    // Only a row whose stored state says off ends up here, and that one is
    // stale.
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(OBLIQUE_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn]);
};
