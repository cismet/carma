import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { GeoJsonDataSource, Color, Viewer } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { useObliqueDataContext } from "../../oblique/hooks/useObliqueDataContext";

import { getObliqueMode } from "../../store/slices/ui";
import {
  findMatchingFeature,
  createFilteredGeoJson,
  configureFootprintEntity,
} from "../utils/footprintUtils";

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";

const cleanupDatasources = (viewer: Viewer) => {
  try {
    const dataSources = viewer.dataSources;
    const length = dataSources.length;
    for (let i = 0; i < length; i++) {
      const datasource = dataSources.get(i);
      if (
        datasource.name &&
        datasource.name.startsWith(OBLIQUE_DATASOURCE_PREFIX)
      ) {
        dataSources.remove(datasource);
      }
    }
  } catch (error) {
    console.warn("Error cleaning up oblique data sources:", error);
  }
};

export const ObliqueFootprintLayer: React.FC = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint } =
    useObliqueDataContext();

  const dataSourceRef = useRef(null);
  const lastImageIdRef = useRef(null);

  // Clean up data source when component unmounts or oblique mode disabled
  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    return () => {
      if (viewer && viewer.dataSources && !isObliqueMode) {
        dataSource && viewer.dataSources.remove(dataSource);
        if (viewer.dataSources.length > 0) {
          console.info("Cleaning up leftover footprint data sources");
          cleanupDatasources(viewer);
        }
        dataSourceRef.current = null;
        viewer.scene.requestRender();
      }
    };
  }, [viewerRef, isObliqueMode]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (
      !isObliqueMode ||
      !viewer ||
      !nearestImage ||
      !footprintData ||
      lockFootprint
    ) {
      return;
    }

    // Skip unnecessary updates
    if (nearestImage.record.id === lastImageIdRef.current) {
      return;
    }

    lastImageIdRef.current = nearestImage.record.id;

    // Remove previous datasource if exists
    if (dataSourceRef.current) {
      viewer.dataSources.remove(dataSourceRef.current);
      cleanupDatasources(viewer);
      dataSourceRef.current = null;
    }

    const matchingFeature = findMatchingFeature(
      footprintData.features,
      nearestImage.record.id
    );

    if (!matchingFeature) return;

    const filteredGeoJson = createFilteredGeoJson(matchingFeature);

    GeoJsonDataSource.load(filteredGeoJson, {
      clampToGround: true,
      stroke: Color.TRANSPARENT,
      fill: Color.WHITE.withAlpha(0.6),
      strokeWidth: 0,
      credit: "",
    }).then((dataSource) => {
      dataSource.entities.values.forEach(configureFootprintEntity);
      dataSource.name = `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`;
      viewer.dataSources.add(dataSource);
      dataSourceRef.current = dataSource;
      viewer.scene.requestRender();
    });
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, lockFootprint]);

  return null;
};

export default ObliqueFootprintLayer;
