import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useDispatch, useSelector } from "react-redux";
import { defaultLayerConfig } from "../../config";
import {
  getBackgroundLayer,
  getLayers,
  setLibreMapRef,
} from "../../store/slices/mapping";
import "./LibreGeoportalMap.css";
import { getCoordinates } from "./topicmap.utils";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import {
  functionToFeature,
  objectToFeature,
} from "../feature-info/featureInfoHelper";
import { setSelectedFeature } from "../../store/slices/features";
import store from "../../store";
import { layersToMapLibreStyle } from "./libremap.utils";

const LibreGeoportalMap = () => {
  const dispatch = useDispatch();

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFeatures: Set<{
    source: string;
    sourceLayer: string;
    id: string | number;
    selectionLayerId?: string;
  }> = new Set();

  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 15;

  const backgroundStyle: StyleSpecification = {
    version: 8,
    sources: {
      "source-amtlich": {
        type: "raster",
        tiles: [
          "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "layer-amtlich",
        type: "raster",
        source: "source-amtlich",
        paint: { "raster-opacity": 0.9 },
      },
    ],
  };

  const createFeature = (coordinates, selectedVectorFeature, layer) => {
    let feature = undefined;
    const vectorPos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      coordinates
    );

    let properties = selectedVectorFeature.properties;
    properties = {
      ...properties,
      vectorId: selectedVectorFeature.id,
    };
    let result = "";
    let featureInfoZoom = 20;
    let blockLegacyGetFeatureInfo = false;
    layer.other.keywords.forEach((keyword) => {
      const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
      const zoom = keyword.split("carmaConf://featureInfoZoom:")[1];

      if (keyword.includes("blockLegacyGetFeatureInfo")) {
        blockLegacyGetFeatureInfo = true;
      }

      if (extracted) {
        result += extracted + "\n";
      }

      if (zoom) {
        featureInfoZoom = parseInt(zoom);
      }
    });

    if (result) {
      if (result.includes("function")) {
        // remove every line that is not a function
        result = result
          .split("\n")
          .filter((line) => line.includes("function"))
          .join("\n");
      }

      const featureProperties = result.includes("function")
        ? functionToFeature(properties, result)
        : objectToFeature(properties, result);
      if (!featureProperties) {
        return undefined;
      }
      const genericLinks = featureProperties.properties.genericLinks || [];

      feature = {
        properties: {
          ...featureProperties.properties,
          genericLinks: genericLinks,
          zoom: featureInfoZoom,
        },
        geometry: selectedVectorFeature.geometry,
        id: layer.id,
        showMarker:
          selectedVectorFeature.geometry.type === "Polygon" ||
          selectedVectorFeature.geometry.type === "MultiPolygon",
      };
    }
    return feature;
  };

  useEffect(() => {
    if (map.current) return; // initialize map only once

    if (mapContainer.current) {
      const lng = searchParams.get("lng")
        ? parseFloat(searchParams.get("lng"))
        : defaultLng;
      const lat = searchParams.get("lat")
        ? parseFloat(searchParams.get("lat"))
        : defaultLat;
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: searchParams.get("zoom")
          ? parseFloat(searchParams.get("zoom")) - 1
          : defaultZoom,
        maxZoom: 21,
        minZoom: 9,
        pitch: searchParams.get("pitch")
          ? parseFloat(searchParams.get("pitch"))
          : 0,
        bearing: searchParams.get("heading")
          ? parseFloat(searchParams.get("heading"))
          : 0,
        maxPitch: 85,
      });

      dispatch(setLibreMapRef(map));

      map.current.on("click", (e) => {
        const point = map.current.project([e.lngLat.lng, e.lngLat.lat]);

        const hits = map.current.queryRenderedFeatures(point);
        let filteredHits = hits.filter((hit) => {
          return !hit.layer.id.includes("selection");
        });

        // Clear all selection layers by resetting their filters
        selectedFeatures.forEach((feature) => {
          try {
            // If we have a selection layer ID, reset its filter
            if (
              feature.selectionLayerId &&
              map.current?.getLayer(feature.selectionLayerId)
            ) {
              // Set a filter that won't match any features
              map.current.setFilter(feature.selectionLayerId, [
                "==",
                "__selected__",
                "true",
              ]);
            } else {
              map.current?.setFeatureState(
                {
                  source: feature.source,
                  sourceLayer: feature.sourceLayer,
                  id: feature.id,
                },
                { selected: false }
              );
            }
          } catch (error) {
            console.error("Error clearing building selection:", error);
          }
        });

        selectedFeatures.clear();
        dispatch(setSelectedFeature(null));

        if (filteredHits.length > 0) {
          const selectedVectorFeature = filteredHits[0];

          const coordinates = getCoordinates(selectedVectorFeature.geometry);
          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
          const currentLayers = getLayers(store.getState());
          const layer = currentLayers.find((layer) => layer.id === layerId);
          let feature;
          if (layer) {
            feature = createFeature(coordinates, selectedVectorFeature, layer);
          } else {
            if (!selectedVectorFeature.layer.id.includes("3D")) {
              return;
            }
            feature = {
              geometry: selectedVectorFeature.geometry,
              id: "3d_gebaeude",
              properties: {
                header: "Gebäude Informationen",
                title: selectedVectorFeature.properties.klasse,
                subtitle:
                  "Höhe: " + selectedVectorFeature.properties.hoehe + "m",
              },
            };
          }

          if (feature) {
            if (layer) {
              map.current.setFeatureState(
                {
                  source: selectedVectorFeature.source,
                  sourceLayer: selectedVectorFeature.sourceLayer,
                  id: selectedVectorFeature.id,
                },
                { selected: true }
              );
              selectedFeatures.add({
                source: selectedVectorFeature.source,
                sourceLayer: selectedVectorFeature.sourceLayer,
                id: selectedVectorFeature.id,
              });
            } else {
              // Create a unique identifier for this building using its properties and coordinates
              const buildingType =
                selectedVectorFeature.properties?.klasse || "";
              const buildingHeight =
                selectedVectorFeature.properties?.hoehe || "";

              // Get the selection layer ID based on the original layer ID
              const originalLayerId = selectedVectorFeature.layer.id;
              const selectionLayerId = `${originalLayerId}-selection`;

              // Store information about the selected feature for later deselection
              const selectedInfo = {
                source: selectedVectorFeature.source,
                sourceLayer: selectedVectorFeature.sourceLayer,
                id:
                  selectedVectorFeature.id ||
                  `${buildingType}-${buildingHeight}`,
                selectionLayerId: selectionLayerId,
                geometryCoordinates: JSON.stringify(
                  // @ts-expect-error
                  selectedVectorFeature.geometry.coordinates[0].slice(0, 3)
                ),
              };

              // Update the selection layer filter to show this building
              if (map.current.getLayer(selectionLayerId)) {
                const filterConditions: any[] = [
                  "all",
                  ["==", ["geometry-type"], "Polygon"],
                ];

                // Add building type condition if available
                if (buildingType) {
                  filterConditions.push([
                    "==",
                    ["get", "klasse"],
                    buildingType,
                  ]);
                }

                // Add building height condition if available
                if (buildingHeight) {
                  filterConditions.push([
                    "==",
                    ["get", "hoehe"],
                    buildingHeight,
                  ]);
                }

                // Add a condition to match the specific feature ID if available
                if (selectedVectorFeature.id) {
                  filterConditions.push([
                    "==",
                    ["id"],
                    selectedVectorFeature.id,
                  ]);
                }

                if (false) {
                  map.current.setFilter(
                    selectionLayerId,
                    filterConditions as FilterSpecification
                  );
                }
              } else {
                console.warn("Selection layer not found:", selectionLayerId);
              }

              selectedFeatures.add(selectedInfo);
            }
            dispatch(setSelectedFeature(feature));
          }
        }
      });

      map.current.on("remove", () => {
        dispatch(setLibreMapRef(null));
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    const handleMoveEnd = () => {
      if (!mapInstance) return;

      const center = mapInstance.getCenter();
      const zoom = mapInstance.getZoom();
      const pitch = mapInstance.getPitch();
      const bearing = mapInstance.getBearing();

      const newParams = new URLSearchParams(searchParams);
      newParams.set("lng", center.lng.toFixed(14));
      newParams.set("lat", center.lat.toFixed(14));
      newParams.set("zoom", (zoom + 1).toFixed(0));
      newParams.set("pitch", pitch.toFixed(2));
      newParams.set("heading", bearing.toFixed(1));
      setSearchParams(newParams);
    };

    mapInstance.on("moveend", handleMoveEnd);

    return () => {
      mapInstance.off("moveend", handleMoveEnd);
    };
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        const style = await layersToMapLibreStyle(backgroundLayer, layers);
        map.current?.setStyle(style);
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [layers, backgroundLayer]);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
};

export default LibreGeoportalMap;
