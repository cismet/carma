import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { LngLatBounds } from "maplibre-gl";
import pointOnFeature from "@turf/point-on-feature";
import { CarmaMap } from "@carma-mapping/core";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import {
  MeasurementHost,
  MeasurementsProvider,
} from "@carma-mapping/measurements";
import { getBackgroundLibreLayers } from "../commons/BackgroundLayers";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getSelectedTrueOrthoYear,
} from "../../store/slices/ui";
import {
  applyFeatureCollectionLayers,
  buildFeatureCollectionGeoJSON,
} from "../../core/tools/libreFeatures";
import { planarArea, toWgs84 } from "../../core/wizard/geometry";
import AreaTools from "./AreaTools";
import AssignAreaModal from "./AssignAreaModal";

const PARCEL_STYLE = {
  color: "#005F6B",
  weight: 1,
  opacity: 0.6,
  fillColor: "#26ADE4",
  fillOpacity: 0.25,
};

// free pieces stand out until they are assigned
const PIECE_STYLE = {
  color: "#d46b08",
  weight: 2,
  opacity: 1,
  fillColor: "#fa8c16",
  fillOpacity: 0.35,
};

const LABEL_SOURCE_ID = "lagis-area-labels";
const LABEL_LAYER_ID = "lagis-area-labels-symbols";

const formatArea = (area) =>
  `${Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

// m² in the middle of each area, the same number as in the table
const areaLabels = (areas, pieces) => ({
  type: "FeatureCollection",
  features: [
    ...areas
      .filter((area) => area.geometry && Number.isFinite(area.flaeche))
      .map((area) => ({ geometry: area.geometry, area: area.flaeche })),
    ...pieces.map((piece) => ({
      geometry: piece.geometry,
      area: Math.round(planarArea(piece.geometry) * 100) / 100,
    })),
  ].map(({ geometry, area }) => ({
    type: "Feature",
    geometry: pointOnFeature(toWgs84(geometry)).geometry,
    properties: { label: formatArea(area) },
  })),
});

// styledata fires far more often than the labels change
const lastLabels = new WeakMap();

const applyAreaLabels = (map, data) => {
  if (!map?.style?._loaded) {
    return;
  }
  const source = map.getSource(LABEL_SOURCE_ID);
  if (source) {
    if (lastLabels.get(map) !== data) {
      source.setData(data);
      lastLabels.set(map, data);
    }
    return;
  }
  map.addSource(LABEL_SOURCE_ID, { type: "geojson", data });
  lastLabels.set(map, data);
  map.addLayer({
    id: LABEL_LAYER_ID,
    type: "symbol",
    source: LABEL_SOURCE_ID,
    layout: {
      "text-field": ["get", "label"],
      // served by the cismet glyph server, like the measurement labels
      "text-font": ["literal", ["Open Sans Bold"]],
      "text-size": 13,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#111",
      "text-halo-color": "#FFFFFF",
      "text-halo-width": 2,
    },
  });
};

const boundsOf = (geometry) => {
  const bounds = new LngLatBounds();
  const visit = (coords) =>
    typeof coords[0] === "number"
      ? bounds.extend(coords)
      : coords.forEach(visit);
  visit(toWgs84(geometry).coordinates);
  return bounds;
};

const AreaMap = forwardRef(
  (
    {
      parcelGeometry,
      areas,
      pieces = [],
      activeId,
      initialFeatures,
      onFeaturesChange,
      onSelectionChange,
      drawMode,
      snapping,
      midpoints,
      tools,
      assignDialog,
    },
    hostRef
  ) => {
    const [libreMap, setLibreMap] = useState(null);

    const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
    const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
    const selectedTrueOrthoYear = useSelector(getSelectedTrueOrthoYear);
    const libreLayers = useMemo(
      () =>
        getBackgroundLibreLayers(
          activeBackgroundLayer,
          backgroundLayerOpacities,
          selectedTrueOrthoYear
        ),
      [activeBackgroundLayer, backgroundLayerOpacities, selectedTrueOrthoYear]
    );

    const geoJSON = useMemo(
      () =>
        buildFeatureCollectionGeoJSON(
          [
            ...(parcelGeometry
              ? [{ geometry: parcelGeometry, style: PARCEL_STYLE }]
              : []),
            ...areas
              .filter((area) => area.geometry)
              .map((area) => ({
                geometry: area.geometry,
                style: {
                  color: "#005F6B",
                  weight: area.id === activeId ? 3 : 1,
                  opacity: 0.8,
                  fillColor: area.color || "#8c8c8c",
                  fillOpacity: area.id === activeId ? 0.6 : 0.35,
                },
              })),
            ...pieces.map((piece) => ({
              geometry: piece.geometry,
              style: PIECE_STYLE,
            })),
          ],
          (feature) => feature.style
        ),
      [areas, pieces, activeId, parcelGeometry]
    );

    const labels = useMemo(() => areaLabels(areas, pieces), [areas, pieces]);

    // the source is imperative and has to come back after a style reload
    useEffect(() => {
      if (!libreMap) {
        return undefined;
      }
      const apply = () => {
        applyFeatureCollectionLayers(libreMap, geoJSON);
        applyAreaLabels(libreMap, labels);
      };
      apply();
      libreMap.on("styledata", apply);
      return () => {
        libreMap.off("styledata", apply);
      };
    }, [libreMap, geoJSON, labels]);

    useEffect(() => {
      if (libreMap && parcelGeometry) {
        libreMap.fitBounds(boundsOf(parcelGeometry), {
          padding: 30,
          duration: 0,
        });
      }
    }, [libreMap, parcelGeometry]);

    return (
      <div
        className="lagis-libre-map rounded-md border"
        style={{ flex: 1, minHeight: 420 }}
      >
        <LibreContextProvider>
          <MeasurementsProvider>
            <CarmaMap
              mapEngine="maplibre"
              appKey="lagis-desktop"
              embedded
              backgroundLayers=""
              libreLayers={libreLayers}
              setLibreMap={setLibreMap}
              minZoom={9}
              maxZoom={25}
              hashWriteEnabled={false}
              selectionEnabled={false}
              gazetteerInfoOnClick={false}
              gazetteerSearchControl={false}
              terrainControl={false}
              compassControl={false}
              fullScreenControl={false}
              locatorControl={false}
              modalMenuControl={false}
              extraControls={<AreaTools {...tools} />}
            />
            <MeasurementHost
              ref={hostRef}
              mode={drawMode}
              snapping={snapping}
              featureDraggable={false}
              closePointerDistancePx={8}
              midpoints={midpoints}
              labelsVisible={false}
              styleVariant="carma"
              initialFeatures={initialFeatures}
              onChange={onFeaturesChange}
              onSelectionChange={onSelectionChange}
            />
          </MeasurementsProvider>
        </LibreContextProvider>
        <AssignAreaModal dialog={assignDialog} />
      </div>
    );
  }
);

export default AreaMap;
