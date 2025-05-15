import { useEffect, useState, useRef } from "react";
import { useSelection } from "./SelectionProvider";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import * as turf from "@turf/turf";

interface SelectionContentProps {
  map: maplibregl.Map;
}

export const LibreMapSelectionContent = ({ map }: SelectionContentProps) => {
  const [marker, setMarker] = useState<maplibregl.Marker | undefined>();
  const { selection, overlayFeature } = useSelection();
  const maskSourceId = useRef("mask-source");
  const maskLayerId = useRef("mask-layer");
  const featureSourceId = useRef("feature-source");

  useEffect(() => {
    marker?.remove();
    if (selection) {
      if (selection.isAreaSelection) {
      } else {
        const pos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);
        setMarker(
          new maplibregl.Marker().setLngLat([pos[0], pos[1]]).addTo(map)
        );
      }
    }
  }, [selection]);

  useEffect(() => {
    // Clean up any existing mask layers when component unmounts or when selection changes
    return () => {
      if (map) {
        if (map.getLayer(maskLayerId.current)) {
          map.removeLayer(maskLayerId.current);
        }
        if (map.getSource(maskSourceId.current)) {
          map.removeSource(maskSourceId.current);
        }
        if (map.getLayer("feature-outline")) {
          map.removeLayer("feature-outline");
        }
        if (map.getLayer("feature-fill")) {
          map.removeLayer("feature-fill");
        }
        if (map.getSource(featureSourceId.current)) {
          map.removeSource(featureSourceId.current);
        }
      }
    };
  }, [map, selection]);

  useEffect(() => {
    if (map && overlayFeature && selection?.isAreaSelection) {
      // Create a mask that covers the entire viewport except for the feature
      try {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const padding = 1; // degrees
        const worldBbox = [
          sw.lng - padding,
          sw.lat - padding,
          ne.lng + padding,
          ne.lat + padding,
        ];
        // fix typescript error
        // @ts-expect-error
        const worldPolygon = turf.bboxPolygon(worldBbox);

        let featureGeoJSON = JSON.parse(JSON.stringify(overlayFeature));

        // We need to convert from EPSG:3857 to EPSG:4326 for MapLibre to display correctly
        if (
          featureGeoJSON.geometry?.coordinates &&
          featureGeoJSON.geometry.type === "Polygon"
        ) {
          const transformedCoordinates =
            featureGeoJSON.geometry.coordinates.map((ring) => {
              return ring.map((coord) => {
                const transformed = proj4(proj4crs3857def, proj4crs4326def, [
                  coord[0],
                  coord[1],
                ]);
                return transformed;
              });
            });

          featureGeoJSON.geometry.coordinates = transformedCoordinates;

          if (featureGeoJSON.geometry.crs) {
            featureGeoJSON.geometry.crs = {
              type: "name",
              properties: {
                name: "EPSG:4326",
              },
            };
          }
        }

        // Add the feature source for highlighting the actual feature
        if (!map.getSource(featureSourceId.current)) {
          map.addSource(featureSourceId.current, {
            type: "geojson",
            data: featureGeoJSON,
          });
        } else {
          const source = map.getSource(
            featureSourceId.current
          ) as maplibregl.GeoJSONSource;
          source.setData(featureGeoJSON);
        }

        // Add the mask source (using the world polygon directly instead of a difference)
        if (!map.getSource(maskSourceId.current)) {
          map.addSource(maskSourceId.current, {
            type: "geojson",
            data: worldPolygon,
          });
        } else {
          const source = map.getSource(
            maskSourceId.current
          ) as maplibregl.GeoJSONSource;
          source.setData(worldPolygon);
        }

        // Create a mask using a feature-state filter instead of a separate polygon
        if (map.getLayer("feature-fill")) {
          map.removeLayer("feature-fill");
        }
        map.addLayer({
          id: "feature-fill",
          type: "fill",
          source: featureSourceId.current,
          paint: {
            "fill-color": "#ffffff", // White fill to show the map underneath
            "fill-opacity": 0.0, // Completely transparent
          },
        });

        // Add the feature outline layer
        if (map.getLayer("feature-outline")) {
          map.removeLayer("feature-outline");
        }
        map.addLayer({
          id: "feature-outline",
          type: "line",
          source: featureSourceId.current,
          paint: {
            "line-color": "#3388ff", // Blue outline
            "line-width": 3,
          },
        });

        // Now add the mask layer as an inverted polygon
        try {
          const mask = turf.difference(
            turf.featureCollection([worldPolygon, featureGeoJSON])
          );

          if (mask) {
            if (!map.getSource(maskSourceId.current)) {
              map.addSource(maskSourceId.current, {
                type: "geojson",
                data: mask,
              });
            } else {
              const source = map.getSource(
                maskSourceId.current
              ) as maplibregl.GeoJSONSource;
              source.setData(mask);
            }

            if (map.getLayer(maskLayerId.current)) {
              map.removeLayer(maskLayerId.current);
            }
            map.addLayer(
              {
                id: maskLayerId.current,
                type: "fill",
                source: maskSourceId.current,
                paint: {
                  "fill-color": "#000000",
                  "fill-opacity": 0.5,
                },
              },
              "feature-fill"
            );
          }
        } catch (maskError) {
          console.error("Error creating mask with turf.difference:", maskError);
          // Fallback: just add a semi-transparent overlay to the whole map
          if (!map.getSource(maskSourceId.current)) {
            map.addSource(maskSourceId.current, {
              type: "geojson",
              data: worldPolygon,
            });
          } else {
            const source = map.getSource(
              maskSourceId.current
            ) as maplibregl.GeoJSONSource;
            source.setData(worldPolygon);
          }

          if (map.getLayer(maskLayerId.current)) {
            map.removeLayer(maskLayerId.current);
          }
          map.addLayer({
            id: maskLayerId.current,
            type: "fill",
            source: maskSourceId.current,
            paint: {
              "fill-color": "#000000",
              "fill-opacity": 0.5,
            },
          });
        }

        const shouldFitBounds =
          selection?.selectionTimestamp &&
          Date.now() - selection.selectionTimestamp < 1000;

        if (shouldFitBounds) {
          try {
            if (
              featureGeoJSON.geometry?.coordinates &&
              featureGeoJSON.geometry.type === "Polygon"
            ) {
              const coordinates = featureGeoJSON.geometry.coordinates[0];

              if (coordinates && coordinates.length > 0) {
                let minX = coordinates[0][0];
                let minY = coordinates[0][1];
                let maxX = coordinates[0][0];
                let maxY = coordinates[0][1];

                coordinates.forEach((coord) => {
                  const x = coord[0];
                  const y = coord[1];

                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x);
                  maxY = Math.max(maxY, y);
                });

                map.fitBounds(
                  [
                    [minX, minY],
                    [maxX, maxY],
                  ],
                  { padding: 50, maxZoom: 18 }
                );
              }
            }
          } catch (fitError) {
            console.error("Error fitting bounds:", fitError);
          }
        }
      } catch (error) {
        console.error("Error creating mask:", error);
      }
    }
  }, [map, overlayFeature, selection]);

  if (selection?.isAreaSelection) {
    return overlayFeature && <></>;
  } else {
    return <></>;
  }
};
