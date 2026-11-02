import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import { CarmaMap } from "@carma-mapping/core";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import { MeasurementsProvider } from "@carma-mapping/measurements";
import useLagisLibreLayers from "../commons/useLagisLibreLayers";
import { applyFeatureCollectionLayers } from "../../core/tools/libreFeatures";
import { toWgs84 } from "../../core/wizard/geometry";
import { AreaHost, buildAreaGeoJSON, useAreaLabels } from "./areaLayers";
import AreaTools from "./AreaTools";
import AssignAreaModal from "./AssignAreaModal";

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
      tools,
      assignDialog,
      ...hostProps
    },
    hostRef
  ) => {
    const [libreMap, setLibreMap] = useState(null);
    const libreLayers = useLagisLibreLayers();

    const geoJSON = useMemo(
      () => buildAreaGeoJSON({ parcelGeometry, areas, pieces, activeId }),
      [areas, pieces, activeId, parcelGeometry]
    );

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

    useAreaLabels(libreMap, areas, pieces);

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
            <AreaHost ref={hostRef} {...hostProps} />
          </MeasurementsProvider>
        </LibreContextProvider>
        <AssignAreaModal dialog={assignDialog} />
      </div>
    );
  }
);

export default AreaMap;
