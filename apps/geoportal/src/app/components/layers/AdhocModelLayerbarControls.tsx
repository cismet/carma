import { useContext } from "react";
import { useDispatch } from "react-redux";

import pointOnFeature from "@turf/point-on-feature";
import L from "leaflet";
import maplibregl from "maplibre-gl";
import { Tooltip } from "antd";
import Icon from "react-cismap/commons/Icon";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import type { AdhocMapLibreStyleData } from "@carma-appframeworks/portals";
import { useLibreContext } from "@carma-mapping/contexts";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { setTriggerSelectionById } from "../../store/slices/features";
import { resolveAdhocStyleData } from "../../helper/adhoc-feature-utils";
import {
  zoomToLibreStyleFeatures,
  zoomToStyleFeatures,
} from "../../helper/gisHelper";
import { getGeoportalLayerToolActionButtonClassName } from "./layer-tool-action-button-style";
import { resolveAdhocFocusObjectLabel } from "./measurement-import-utils";

const findFirstStyleFeatureWithGeometry = (
  styleData: AdhocMapLibreStyleData
): GeoJSON.Feature | undefined => {
  for (const sourceKey in styleData.sources) {
    const source = styleData.sources[sourceKey] as any;
    if (source?.data?.type === "FeatureCollection" && source.data.features) {
      const clickFeature = source.data.features.find(
        (feature: GeoJSON.Feature) => feature.geometry
      );
      if (clickFeature) {
        return clickFeature;
      }
    }
  }
  return undefined;
};

export const AdhocModelFlyToLayerbarAction = ({
  layer,
}: {
  layer: Layer | BackgroundLayer;
}) => {
  const dispatch = useDispatch();
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const focusObjectLabel =
    resolveAdhocFocusObjectLabel(layer) ?? adhocModel.actions.focusObject;

  if (layer.type !== "object" || !layer.props?.style) {
    return null;
  }

  const handleFlyTo = async () => {
    if (libreMap) {
      const styleData = await resolveAdhocStyleData(layer.props?.style);
      if (!styleData) {
        return;
      }

      const clickFeature = findFirstStyleFeatureWithGeometry(styleData);
      if (clickFeature?.geometry) {
        const clickPoint = pointOnFeature(
          clickFeature as GeoJSON.Feature<GeoJSON.Geometry>
        );
        const [lng, lat] = clickPoint.geometry.coordinates;

        const fireClick = () => {
          const lngLat = new maplibregl.LngLat(lng, lat);
          libreMap.fire("click", { lngLat, point: libreMap.project(lngLat) });
        };

        let fired = false;
        const onMoveEnd = () => {
          if (fired) {
            return;
          }
          fired = true;
          libreMap.off("moveend", onMoveEnd);
          setTimeout(fireClick, 300);
        };

        libreMap.on("moveend", onMoveEnd);
        // Fallback: if fitBounds snaps without animation, moveend may already have fired.
        setTimeout(onMoveEnd, 500);
      }

      zoomToLibreStyleFeatures(styleData, libreMap);
      return;
    }

    const styleData = await resolveAdhocStyleData(layer.props?.style);
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    if (styleData && leafletMap) {
      const clickFeature = findFirstStyleFeatureWithGeometry(styleData);
      if (clickFeature?.geometry) {
        const clickPoint = pointOnFeature(
          clickFeature as GeoJSON.Feature<GeoJSON.Geometry>
        );
        const [lng, lat] = clickPoint.geometry.coordinates;
        const latlngPoint = L.latLng(lat, lng);

        const fireClick = () => {
          leafletMap.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: leafletMap.latLngToLayerPoint(latlngPoint),
            containerPoint: leafletMap.latLngToContainerPoint(latlngPoint),
          });
        };

        let fired = false;
        const onMoveEnd = () => {
          if (fired) return;
          fired = true;
          leafletMap.off("moveend", onMoveEnd);
          setTimeout(fireClick, 300);
        };

        leafletMap.on("moveend", onMoveEnd);
        // Fallback: if fitBounds snaps without animation, moveend may already have fired.
        setTimeout(onMoveEnd, 500);
      }

      await zoomToStyleFeatures(styleData, routedMapRef);
      return;
    }

    await zoomToStyleFeatures(styleData, routedMapRef);
    dispatch(setTriggerSelectionById(layer.id));
  };

  return (
    <Tooltip title={focusObjectLabel} placement="top">
      <button
        aria-label={focusObjectLabel}
        className={getGeoportalLayerToolActionButtonClassName(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleFlyTo();
        }}
        type="button"
      >
        <Icon name="search-location" className="leading-none" />
      </button>
    </Tooltip>
  );
};
