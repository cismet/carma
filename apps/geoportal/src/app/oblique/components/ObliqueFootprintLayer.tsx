import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { GeoJsonDataSource, Color } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "./ObliqueDataContext";
import {
  findMatchingFeature,
  createFilteredGeoJson,
  configureFootprintEntity,
} from "../utils/footprintUtils";

export const ObliqueFootprintLayer: React.FC = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData } = useObliqueDataContext();
  const dataSourceRef = useRef<GeoJsonDataSource | null>(null);

  // Clean up data source when component unmounts
  useEffect(() => {
    const viewer = viewerRef.current;

    return () => {
      if (dataSourceRef.current && viewer) {
        viewer.dataSources.remove(dataSourceRef.current, true);
        dataSourceRef.current = null;
      }
    };
  }, [viewerRef]);

  // Track oblique mode changes and clean up when exiting oblique mode
  useEffect(() => {
    if (!isObliqueMode && dataSourceRef.current && viewerRef.current) {
      viewerRef.current.dataSources.remove(dataSourceRef.current, true);
      dataSourceRef.current = null;
      viewerRef.current.scene.requestRender();
    }
  }, [isObliqueMode, viewerRef]);

  useEffect(() => {
    if (!isObliqueMode || !viewerRef.current || !footprintData || !nearestImage)
      return;

    const viewer = viewerRef.current;

    if (dataSourceRef.current) {
      viewer.dataSources.remove(dataSourceRef.current, true);
      dataSourceRef.current = null;
    }

    const matchingFeature = findMatchingFeature(
      footprintData.features,
      nearestImage.id
    );

    if (!matchingFeature) {
      console.log(`No footprint found for image ID: ${nearestImage.id}`);
      return;
    }

    // Process the feature to create the buffered visualization
    const filteredGeoJson = createFilteredGeoJson(matchingFeature);

    GeoJsonDataSource.load(filteredGeoJson, {
      clampToGround: true,
      stroke: Color.TRANSPARENT,
      fill: Color.WHITE.withAlpha(0.6),
      strokeWidth: 0,
      credit: "",
    })
      .then((dataSource) => {
        viewer.dataSources.add(dataSource);
        dataSourceRef.current = dataSource;

        dataSource.entities.values.forEach(configureFootprintEntity);
        viewer.scene.requestRender();
      })
      .catch((error) =>
        console.error("Error loading footprint GeoJSON:", error)
      );
  }, [isObliqueMode, viewerRef, footprintData, nearestImage]);

  return null;
};

export default ObliqueFootprintLayer;
