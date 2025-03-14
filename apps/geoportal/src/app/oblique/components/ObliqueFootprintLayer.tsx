import React, { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import {
  Entity,
  GeoJsonDataSource,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
} from "cesium";
import { buffer, difference, featureCollection } from "@turf/turf";

import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "./ObliqueDataContext";
import { Feature } from "@turf/helpers";

interface FootprintProperties {
  FILENAME: string;
  [key: string]: string | number | boolean;
}

interface FootprintFeature {
  type: string;
  properties: FootprintProperties;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

interface FootprintCollection {
  type: string;
  features: FootprintFeature[];
}

const FOOTPRINT_URL =
  "https://wupp-oblique.cismet.de/2024/metadata/fprfc.geojson";

const fetchGeoJson = async (url: string): Promise<FootprintCollection> => {
  const response = await fetch(url);
  return response.json();
};

const findMatchingFeature = (features: FootprintFeature[], imageId: string) =>
  features.find((feature) => feature.properties.FILENAME === imageId);

const BUFFER_WIDTH_METERS = 10;

// Create a hollow buffer around the feature using the same method as in ObliqueAndMesh
const createFilteredGeoJson = (
  feature: FootprintFeature
): FootprintCollection => {
  try {
    // Create a deep copy of the feature to avoid modifying the original
    const featureCopy = JSON.parse(JSON.stringify(feature));

    // Buffer the geometry by meters
    const buffered = buffer(featureCopy, BUFFER_WIDTH_METERS, {
      units: "meters",
    });

    // Subtract the original geometry from the buffered one
    // Using the exact same approach as in ObliqueAndMesh.tsx
    const outline = difference(
      featureCollection([buffered as Feature, featureCopy as Feature])
    );

    // Use the outline geometry but keep the original properties
    if (outline && outline.geometry) {
      const hollowFeature = {
        ...featureCopy,
        geometry: outline.geometry,
      } as Feature;

      return {
        type: "FeatureCollection",
        features: [hollowFeature],
      };
    }

    // Fallback to the original feature if the operation fails
    return {
      type: "FeatureCollection",
      features: [featureCopy],
    };
  } catch (error) {
    console.error("Error creating footprint buffer:", error);
    // Return the original feature as fallback
    return {
      type: "FeatureCollection",
      features: [feature],
    };
  }
};

const configureFootprintEntity = (entity: Entity) => {
  if (entity.polygon) {
    // Remove existing height to allow proper draping
    entity.polygon.height = undefined;
    entity.polygon.outline = new ConstantProperty(false);
    entity.polygon.material = new ColorMaterialProperty(
      Color.WHITE.withAlpha(0.8)
    );
  }
  return entity;
};

export const ObliqueFootprintLayer: React.FC = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage } = useObliqueDataContext();
  const [footprintData, setFootprintData] =
    useState<FootprintCollection | null>(null);
  const dataSourceRef = useRef<GeoJsonDataSource | null>(null);

  useEffect(() => {
    if (!isObliqueMode || !viewerRef.current) return;

    fetchGeoJson(FOOTPRINT_URL)
      .then(setFootprintData)
      .catch((error) => console.error("Error loading footprint data:", error));
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
      })
      .catch((error) =>
        console.error("Error loading footprint GeoJSON:", error)
      );
  }, [isObliqueMode, viewerRef, footprintData, nearestImage]);

  return null;
};

export default ObliqueFootprintLayer;
