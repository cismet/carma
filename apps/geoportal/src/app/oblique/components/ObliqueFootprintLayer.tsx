import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { GeoJsonDataSource, Color } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { useObliqueDataContext } from "../../oblique/hooks/useObliqueDataContext";

import { getObliqueMode } from "../../store/slices/ui";
import {
  findMatchingFeature,
  createFilteredGeoJson,
  configureFootprintEntity,
} from "../utils/footprintUtils";

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
    // store current data source so it's still the same when it's being removed
    const dataSource = dataSourceRef.current;
    return () => {
      if ((dataSource && viewer) || !isObliqueMode) {
        viewer.dataSources.remove(dataSource, true);
        dataSourceRef.current = null;
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
      viewer.dataSources.remove(dataSourceRef.current, true);
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
      viewer.dataSources.add(dataSource);
      dataSourceRef.current = dataSource;
      viewer.scene.requestRender();
    });
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, lockFootprint]);

  return null;
};

export default ObliqueFootprintLayer;
