import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { LngLatBounds } from "maplibre-gl";
import { CarmaMap } from "@carma-mapping/core";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import {
  DrawModeControls,
  MeasurementHost,
  MeasurementInfoBox,
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
import { toWgs84 } from "../../core/wizard/geometry";

const PARCEL_STYLE = {
  color: "#005F6B",
  weight: 1,
  opacity: 0.6,
  fillColor: "#26ADE4",
  fillOpacity: 0.6,
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
      activeId,
      initialFeatures,
      onFeaturesChange,
      drawMode,
      onDrawModeChange,
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
          ],
          (feature) => feature.style
        ),
      [areas, activeId, parcelGeometry]
    );

    // the source is imperative and has to come back after a style reload
    useEffect(() => {
      if (!libreMap) {
        return undefined;
      }
      const apply = () => applyFeatureCollectionLayers(libreMap, geoJSON);
      apply();
      libreMap.on("styledata", apply);
      return () => {
        libreMap.off("styledata", apply);
      };
    }, [libreMap, geoJSON]);

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
              extraControls={
                <>
                  <DrawModeControls
                    modes={["select", "polygon"]}
                    active={drawMode}
                    onSelect={(next) =>
                      onDrawModeChange(drawMode === next ? "none" : next)
                    }
                  />
                  <MeasurementInfoBox />
                </>
              }
            />
            <MeasurementHost
              ref={hostRef}
              mode={drawMode}
              snapping
              initialFeatures={initialFeatures}
              onChange={onFeaturesChange}
            />
          </MeasurementsProvider>
        </LibreContextProvider>
      </div>
    );
  }
);

export default AreaMap;
