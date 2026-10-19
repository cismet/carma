import { useEffect, useMemo } from "react";

import maplibregl from "maplibre-gl";

import type { LibreLayer } from "../components/LibreMap";
import { getGeoJsonSourceId } from "../utils/styleBuilder";

interface UseHoverTooltipOptions {
  map: maplibregl.Map | null;
  layers?: LibreLayer[];
  enabled?: boolean;
}

const FALLBACK_OFFSET = 14;
// Space between the icon's edge and the tooltip's arrow
const ICON_GAP = 6;

const getIconWidth = (
  map: maplibregl.Map,
  feature: maplibregl.MapGeoJSONFeature
): number => {
  const layout = feature.layer.layout as Record<string, unknown> | undefined;
  const paint = feature.layer.paint as Record<string, unknown> | undefined;
  if (paint?.["icon-opacity"] === 0) {
    return 0;
  }
  const iconImage = layout?.["icon-image"] as
    | string
    | { name?: string }
    | undefined;
  const imageName = typeof iconImage === "string" ? iconImage : iconImage?.name;
  const image = imageName ? map.getImage(imageName) : undefined;
  if (!image) {
    return 0;
  }
  const iconSize =
    typeof layout?.["icon-size"] === "number" ? layout["icon-size"] : 1;
  return (image.data.width / image.pixelRatio) * iconSize;
};

const getIconOffset = (
  map: maplibregl.Map,
  feature: maplibregl.MapGeoJSONFeature,
  coordinates: [number, number]
): number => {
  const key = JSON.stringify(coordinates);
  let width = 0;
  for (const candidate of map.queryRenderedFeatures(map.project(coordinates))) {
    if (
      candidate.source === feature.source &&
      candidate.geometry.type === "Point" &&
      JSON.stringify(candidate.geometry.coordinates) === key
    ) {
      width = Math.max(width, getIconWidth(map, candidate));
    }
  }
  return width > 0 ? width / 2 + ICON_GAP : FALLBACK_OFFSET;
};

export const useHoverTooltip = ({
  map,
  layers,
  enabled = true,
}: UseHoverTooltipOptions) => {
  // sourceId -> property name shown in the tooltip
  const tooltipProperties = useMemo(() => {
    const result: Record<string, string> = {};
    (layers ?? []).forEach((layer) => {
      if (layer.type === "geojson" && layer.hoverTooltip) {
        result[getGeoJsonSourceId(layer.name)] = layer.hoverTooltip;
      }
    });
    return result;
  }, [layers]);

  useEffect(() => {
    if (!map || !enabled || Object.keys(tooltipProperties).length === 0) {
      return;
    }

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "carma-hover-tooltip",
      offset: FALLBACK_OFFSET,
    });
    let hovering = false;

    const hide = () => {
      if (hovering) {
        hovering = false;
        popup.remove();
        map.getCanvas().style.cursor = "";
      }
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point);
      } catch {
        // Style might be in the middle of a reload
      }
      const feature = features.find(
        (f) => tooltipProperties[f.source] && !f.properties?.cluster
      );
      const text = feature?.properties?.[tooltipProperties[feature.source]];
      if (!feature || text == null || text === "") {
        hide();
        return;
      }
      const pointCoordinates =
        feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : null;
      const lngLat = pointCoordinates ?? e.lngLat;
      // Beside the feature instead of above it; towards the map center so it
      // doesn't run off the edge. setLngLat below re-applies the anchor.
      const { x } = map.project(lngLat);
      popup.options.anchor =
        x > map.getContainer().clientWidth / 2 ? "right" : "left";
      popup
        .setOffset(
          pointCoordinates
            ? getIconOffset(map, feature, pointCoordinates)
            : FALLBACK_OFFSET
        )
        .setLngLat(lngLat)
        .setText(String(text));
      if (!hovering) {
        hovering = true;
        popup.addTo(map);
        map.getCanvas().style.cursor = "pointer";
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", hide);
    map.on("movestart", hide);
    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", hide);
      map.off("movestart", hide);
      hide();
    };
  }, [map, enabled, tooltipProperties]);
};
