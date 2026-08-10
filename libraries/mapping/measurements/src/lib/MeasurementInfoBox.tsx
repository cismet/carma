import { useContext, useEffect, useMemo, useState } from "react";

import { faBan, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import bbox from "@turf/bbox";
import { Tooltip } from "antd";
import type { FeatureCollection } from "geojson";

import Icon from "react-cismap/commons/Icon";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { ResponsiveInfoBox, utils } from "@carma-appframeworks/portals";
import { COLORS_HEX } from "@carma-commons/utils";
import { useLibreContext } from "@carma-mapping/contexts";

import type { DrawMode } from "./MeasurementControls";
import { buildMeasurementInfo, getMeasurementOrder } from "./measurementInfo";
import { useMeasurements } from "./MeasurementsContext";

const MEASUREMENT_HEADER_COLOR = COLORS_HEX.ACCENT_MEASUREMENTS;

const MEASUREMENT_HELP_TEXT: Record<Exclude<DrawMode, "none">, string[]> = {
  select: [
    "Eine vorhandene Messung anklicken, um sie auszuwählen und zu bearbeiten.",
    "Stützpunkte können per Drag-and-Drop verschoben werden.",
  ],
  point: [
    "Eine Position in der Karte anklicken, um dort einen Messpunkt zu setzen.",
    "Jeder weitere Klick erstellt sofort eine neue Punktmessung.",
  ],
  line: [
    "Eine Folge von Positionen in der Karte anklicken, um einen Linienzug zu messen.",
    "Doppelklick schließt die Messung ab.",
  ],
  polygon: [
    "Eine Folge von Positionen in der Karte anklicken, um eine Fläche zu messen.",
    "Doppelklick oder erneutes Anklicken des Startpunktes schließt die Flächenmessung ab.",
  ],
};

export interface MeasurementInfoBoxProps {
  /** Padding (in pixels) used when zooming to a single measurement via the
   *  zoom button. Forwarded to `utils.zoomToFeature`. Defaults to `[0, 0]`. */
  selectionPadding?: [number, number];
}

export const MeasurementInfoBox = ({
  selectionPadding,
}: MeasurementInfoBoxProps = {}) => {
  const {
    features,
    mode,
    selectedFeature,
    selectedId,
    isDrafting,
    deleteById,
    deselectFeature,
    selectFeature,
    updateTitle,
    cancelDraft,
  } = useMeasurements();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();

  // Re-derive visible features whenever the map viewport changes.
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    if (!libreMap) {
      return;
    }
    const handler = () => setViewportTick((t) => t + 1);
    libreMap.on("moveend", handler);
    return () => {
      libreMap.off("moveend", handler);
    };
  }, [libreMap]);

  const visibleFeatures = useMemo(() => {
    if (!libreMap) {
      return features;
    }
    try {
      const bounds = libreMap.getBounds();
      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      return features.filter((f) => {
        try {
          const [minX, minY, maxX, maxY] = bbox(f);
          if (maxX < west) {
            return false;
          }
          if (minX > east) {
            return false;
          }
          if (maxY < south) {
            return false;
          }
          if (minY > north) {
            return false;
          }
          return true;
        } catch {
          return true;
        }
      });
    } catch {
      return features;
    }
    // viewportTick intentionally triggers recompute on map move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, libreMap, viewportTick]);

  if (!selectedFeature) {
    if (mode === "none") {
      return null;
    }
    const helpLines = MEASUREMENT_HELP_TEXT[mode];
    if (!helpLines) {
      return null;
    }
    return (
      <ResponsiveInfoBox
        pixelwidth={350}
        panelClick={(event) => event.stopPropagation()}
        header=""
        isCollapsible={false}
        alwaysVisibleDiv={
          <div
            className="mt-2 w-[90%] p-2 text-xs font-normal leading-normal text-[#212529] [&_*]:font-normal"
            data-test-id="measurement-info-help"
          >
            <div
              className="pb-0 pt-0 text-[12px] font-normal leading-normal text-[#212529]"
              style={{
                color: "#212529",
                fontSize: "12px",
                fontWeight: 400,
                lineHeight: "normal",
              }}
            >
              {helpLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        }
        collapsibleDiv={<div />}
        fixedRow={false}
      />
    );
  }

  const order = getMeasurementOrder(features, selectedFeature);
  const info = buildMeasurementInfo(selectedFeature, order);

  const customTitle =
    typeof selectedFeature.properties?.customTitle === "string"
      ? selectedFeature.properties.customTitle.trim()
      : "";
  const geometryType = selectedFeature.geometry?.type;
  let defaultBaseTitle: string;
  if (geometryType === "Point") {
    defaultBaseTitle = "Punkt";
  } else if (geometryType === "LineString") {
    defaultBaseTitle = "Linienzug";
  } else if (geometryType === "Polygon") {
    defaultBaseTitle = "Fläche";
  } else {
    defaultBaseTitle = "Messung";
  }
  const baseTitle = customTitle || defaultBaseTitle;

  const titleNumberMatch =
    typeof selectedFeature.properties?.title === "string"
      ? /^[PLF](\d+)$/.exec(selectedFeature.properties.title)
      : null;
  const titleNumber = titleNumberMatch ? titleNumberMatch[1] : "";

  const handleTitleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    if (selectedId === null) {
      return;
    }
    const trimmed = e.currentTarget.textContent?.trim() ?? "";
    if (trimmed.length === 0) {
      // Reset DOM text to the previous value so the user sees the revert.
      e.currentTarget.textContent = capitalizeFirstLetter(baseTitle);
      return;
    }
    if (trimmed === baseTitle) {
      return;
    }
    updateTitle(selectedId, trimmed);
  };

  const handleZoom = () => {
    utils.zoomToFeature({
      selectedFeature: {
        ...selectedFeature,
        properties: selectedFeature.properties ?? {},
      },
      leafletMap: routedMapRef?.leafletMap?.leafletElement,
      libreMap: libreMap ?? undefined,
      padding: selectionPadding,
    });
  };

  const handleDelete = () => {
    if (selectedId !== null) {
      deleteById(selectedId);
    }
    deselectFeature();
  };

  const fitAllMeasurements = () => {
    if (!libreMap || features.length === 0) {
      return;
    }
    try {
      const [minX, minY, maxX, maxY] = bbox({
        type: "FeatureCollection",
        features,
      } as FeatureCollection);
      libreMap.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 50, maxZoom: 18 }
      );
    } catch (e) {
      console.warn("[MEASUREMENT INFOBOX] fit-all failed", e);
    }
  };

  const cycleSelection = (direction: -1 | 1) => {
    if (visibleFeatures.length === 0) {
      return;
    }
    const currentIdx = visibleFeatures.findIndex(
      (f) => String(f.id) === selectedId
    );
    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = direction === 1 ? 0 : visibleFeatures.length - 1;
    } else {
      nextIdx =
        (currentIdx + direction + visibleFeatures.length) %
        visibleFeatures.length;
    }
    const next = visibleFeatures[nextIdx];
    if (next?.id != null) {
      selectFeature(String(next.id));
    }
  };

  return (
    <ResponsiveInfoBox
      pixelwidth={350}
      panelClick={() => {}}
      header={
        <div
          className="w-full"
          style={{ backgroundColor: MEASUREMENT_HEADER_COLOR }}
        >
          Messungen
        </div>
      }
      alwaysVisibleDiv={
        <div className="mt-2 mb-2 w-[96%] flex justify-between items-start gap-4">
          <span style={{ cursor: "text", width: "100%" }}>
            <span
              key={selectedId ?? ""}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={handleTitleBlur}
              className="text-[14px] min-h-[20px] min-w-[10px] mr-1 outline-none"
              data-test-id="measurement-title-editable"
            >
              {capitalizeFirstLetter(baseTitle)}
            </span>
            {titleNumber && (
              <span
                className="text-[14px] mr-2"
                data-test-id="measurement-title-number"
              >
                #{titleNumber}
              </span>
            )}
          </span>
          {isDrafting ? (
            <Tooltip title="Aktuelle Messung abbrechen">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  cancelDraft();
                }}
              >
                <FontAwesomeIcon
                  icon={faBan}
                  className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                  data-test-id="cancel-measurement-btn"
                />
              </div>
            </Tooltip>
          ) : (
            <div className="flex justify-between items-center w-[12%] mt-1 gap-2">
              <Icon
                name="search-location"
                onClick={handleZoom}
                className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                data-test-id="zoom-measurement-btn"
              />
              <FontAwesomeIcon
                onClick={handleDelete}
                className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                icon={faTrashCan}
                data-test-id="delete-measurement-btn"
              />
            </div>
          )}
        </div>
      }
      collapsibleDiv={
        <div>
          {info.subtitle && (
            <div className="text-[12px] mb-1">{info.subtitle}</div>
          )}
          <div className="flex justify-center items-center w-[96%] mt-2 pt-3">
            <span
              className="mx-4 text-[#0078a8] cursor-pointer"
              onClick={fitAllMeasurements}
            >
              {features.length} Messungen verfügbar
            </span>
          </div>
          <div className="flex justify-between items-center w-[96%] mt-1 mb-2">
            <a
              className="renderAsLink text-[#0078a8] cursor-pointer"
              onClick={() => cycleSelection(-1)}
              data-test-id="switch-measurement-left"
              style={{ fontSize: "10.5px" }}
            >
              &lt;&lt;
            </a>
            <span className="mx-4">
              {visibleFeatures.length} Messungen angezeigt
            </span>
            <a
              className="renderAsLink text-[#0078a8] cursor-pointer"
              onClick={() => cycleSelection(1)}
              data-test-id="switch-measurement-right"
              style={{ fontSize: "10.5px" }}
            >
              &gt;&gt;
            </a>
          </div>
        </div>
      }
      fixedRow={true}
    />
  );
};

export default MeasurementInfoBox;

function capitalizeFirstLetter(text: string): string {
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}
