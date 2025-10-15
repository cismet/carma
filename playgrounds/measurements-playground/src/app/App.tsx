import { useEffect, useRef } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MeasurementControl,
  MapMeasurementsObjects,
} from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext, useState } from "react";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
  useSelection,
} from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import {
  TopicMapDispatchContext,
  TopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { ModeButtons } from "./components/ModeButtons";
import { RadiusSliders } from "./components/RadiusSliders";
import { VectorLayerButton } from "./components/VectorLayerButton";

suppressReactCismapErrors();

export function App({ vectorStyles = [] }: { vectorStyles?: any[] }) {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { setSelection } = useSelection();
  useSelectionTopicMap();
  const [selectedFeature, setSelectedFeature] = useState<any>(undefined);
  const [maplibreMap, setMaplibreMap] = useState<any>(null);
  const [queryRadius, setQueryRadius] = useState(() => {
    const saved = localStorage.getItem("measurements-radius");
    return saved ? Number(saved) : 100;
  });
  const [toleranceRadius, setToleranceRadius] = useState(() => {
    const saved = localStorage.getItem("measurements-tolerance-radius");
    return saved ? Number(saved) : 50;
  });
  const [mode, setMode] = useState<
    | "features"
    | "coordinates"
    | "coordinatesUnderPointer"
    | "spider"
    | "spiderRocket"
    | "serious"
  >(() => {
    const saved = localStorage.getItem("measurements-mode");
    return (saved as any) || "features";
  });
  const [seriousClosestPoint, setSeriousClosestPoint] = useState<any>(null);
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  // Check if there's a saved vector style
  const hasSavedVectorStyle =
    localStorage.getItem("measurements-vector-style") !== null;

  // Clear saved vector style
  const clearVectorStyle = () => {
    localStorage.removeItem("measurements-vector-style");
    window.location.reload(); // Reload to clear the map
  };

  // Keep ref in sync with state and save to localStorage
  useEffect(() => {
    queryRadiusRef.current = queryRadius;
    localStorage.setItem("measurements-radius", String(queryRadius));
  }, [queryRadius]);

  // Keep tolerance radius ref in sync and save to localStorage
  useEffect(() => {
    toleranceRadiusRef.current = toleranceRadius;
    localStorage.setItem(
      "measurements-tolerance-radius",
      String(toleranceRadius)
    );
  }, [toleranceRadius]);

  // Save mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("measurements-mode", mode || "");
  }, [mode]);

  // Set up MapLibre highlight layers when maplibreMap becomes available
  useEffect(() => {
    if (maplibreMap) {
      // Add a source for highlighting features
      maplibreMap.addSource("highlight", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add layers for different geometry types
      // Highlight polygons/fills
      maplibreMap.addLayer({
        id: "highlight-fill",
        type: "fill",
        source: "highlight",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#ff0000",
          "fill-opacity": 0.3,
        },
      });

      // Highlight lines (for features)
      maplibreMap.addLayer({
        id: "highlight-line",
        type: "line",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["!", ["has", "spider"]],
        ],
        paint: {
          "line-color": "#ff0000",
          "line-width": 3,
        },
      });

      // Spider lines (grey)
      maplibreMap.addLayer({
        id: "highlight-spider-line",
        type: "line",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "spider"], true],
        ],
        paint: {
          "line-color": "#888888",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });

      // Highlight points (red)
      maplibreMap.addLayer({
        id: "highlight-point",
        type: "circle",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["!", ["has", "grey"]],
        ],
        paint: {
          "circle-radius": 8,
          "circle-color": "#ff0000",
          "circle-opacity": 0.5,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Highlight points (grey for spider rocket)
      maplibreMap.addLayer({
        id: "highlight-point-grey",
        type: "circle",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["==", ["get", "grey"], true],
        ],
        paint: {
          "circle-radius": 8,
          "circle-color": "#888888",
          "circle-opacity": 0.5,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Highlight points (black for serious mode)
      maplibreMap.addLayer({
        id: "highlight-point-black",
        type: "circle",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["==", ["get", "black"], true],
        ],
        paint: {
          "circle-radius": 8,
          "circle-color": "#000000",
          "circle-opacity": 0.8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [maplibreMap]);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : (windowSize?.width || 300) - gap;

  let links: any[] = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displayZoomToFeature: true,
      zoomToFeature: () => {
        if (selectedFeature) {
          const f = JSON.stringify(selectedFeature, null, 2);
          const pf = JSON.parse(f);
          pf.crs = {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::4326",
            },
          };
          console.log("xxx zoomToFeature", pf);

          zoomToFeature(pf);
        }
      },
    });
  }

  useEffect(() => {
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    if (leafletMap && typeof leafletMap.on === "function") {
      // Import L from leaflet
      const L = (window as any).L;

      const mousemoveHandler = (e: any) => {
        // Check zoom level - only work if zoom >= 17
        const currentZoom = leafletMap.getZoom();
        if (currentZoom < 17) {
          // Remove circles if zoom is too low
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          if (toleranceCircleMarkerRef.current) {
            leafletMap.removeLayer(toleranceCircleMarkerRef.current);
            toleranceCircleMarkerRef.current = null;
          }
          return; // Exit early
        }

        // Remove old circles if exist
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
        }

        // Create new outer circle at mouse position with radius in pixels
        circleMarkerRef.current = L.circleMarker(e.latlng, {
          radius: queryRadius,
          color: "#ffffff",
          fillColor: "#ffffff",
          fillOpacity: 0.2,
          weight: 2,
          opacity: 0.5,
        }).addTo(leafletMap);

        // Create new inner tolerance circle (only for spider, spiderRocket, and serious modes)
        if (
          mode === "spider" ||
          mode === "spiderRocket" ||
          mode === "serious"
        ) {
          toleranceCircleMarkerRef.current = L.circleMarker(e.latlng, {
            radius: toleranceRadius,
            color: "#00ff00",
            fillColor: "#00ff00",
            fillOpacity: 0.15,
            weight: 2,
            opacity: 0.6,
          }).addTo(leafletMap);
        }

        // Query features if maplibreMap is available
        if (
          maplibreMap &&
          (mode === "features" ||
            mode === "coordinates" ||
            mode === "coordinatesUnderPointer" ||
            mode === "spider" ||
            mode === "spiderRocket" ||
            mode === "serious")
        ) {
          // Get the MapLibre canvas position relative to the page
          const canvas = maplibreMap.getCanvas();
          const rect = canvas.getBoundingClientRect();

          // Calculate the mouse position relative to the MapLibre canvas
          const point = {
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
          };

          const currentRadius = queryRadiusRef.current;

          const bbox = [
            [point.x - currentRadius, point.y - currentRadius],
            [point.x + currentRadius, point.y + currentRadius],
          ];

          // Query features but exclude our highlight layers to avoid feedback loop
          let features = maplibreMap.queryRenderedFeatures(bbox, {
            layers: maplibreMap
              .getStyle()
              .layers.map((layer: any) => layer.id)
              .filter((id: string) => !id.startsWith("highlight-")),
          });

          if (features.length > 0) {
            maplibreMap.getCanvas().style.cursor = "pointer";

            if (mode === "features") {
              // Mode 1: Highlight features as-is
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: features,
              });
            } else if (mode === "coordinates") {
              // Mode 2: Extract all coordinates as individual points
              const coordinatePoints: any[] = [];

              features.forEach((feature: any) => {
                const geometry = feature.geometry;

                // Extract coordinates based on geometry type
                if (geometry.type === "Point") {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: geometry.coordinates,
                    },
                    properties: {},
                  });
                } else if (geometry.type === "LineString") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "Polygon") {
                  geometry.coordinates.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPoint") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line: any) => {
                    line.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPolygon") {
                  geometry.coordinates.forEach((polygon: any) => {
                    polygon.forEach((ring: any) => {
                      ring.forEach((coord: any) => {
                        coordinatePoints.push({
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: coord,
                          },
                          properties: {},
                        });
                      });
                    });
                  });
                }
              });

              // Update highlight source with coordinate points
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: coordinatePoints,
              });
            } else if (mode === "coordinatesUnderPointer") {
              // Mode 3: Extract all coordinates as individual points, but only show those within the circle radius
              const coordinatePoints: any[] = [];

              features.forEach((feature: any) => {
                const geometry = feature.geometry;

                // Extract coordinates based on geometry type
                if (geometry.type === "Point") {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: geometry.coordinates,
                    },
                    properties: {},
                  });
                } else if (geometry.type === "LineString") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "Polygon") {
                  geometry.coordinates.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPoint") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line: any) => {
                    line.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPolygon") {
                  geometry.coordinates.forEach((polygon: any) => {
                    polygon.forEach((ring: any) => {
                      ring.forEach((coord: any) => {
                        coordinatePoints.push({
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: coord,
                          },
                          properties: {},
                        });
                      });
                    });
                  });
                }
              });

              // Filter points to only those within the circle radius (in pixels)
              const filteredPoints = coordinatePoints.filter(
                (pointFeature: any) => {
                  const coord = pointFeature.geometry.coordinates;
                  // Project the coordinate to screen pixels
                  const projectedPoint = maplibreMap.project(coord);

                  // Calculate distance from mouse pointer in pixels
                  const dx = projectedPoint.x - point.x;
                  const dy = projectedPoint.y - point.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  // Only include if within radius
                  return distance <= currentRadius;
                }
              );

              // Update highlight source with filtered coordinate points
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: filteredPoints,
              });
            } else if (mode === "spider") {
              // Mode 4: Spider - show coordinates under pointer AND draw lines from mouse to each point
              const coordinatePoints: any[] = [];

              features.forEach((feature: any) => {
                const geometry = feature.geometry;

                // Extract coordinates based on geometry type
                if (geometry.type === "Point") {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: geometry.coordinates,
                    },
                    properties: {},
                  });
                } else if (geometry.type === "LineString") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "Polygon") {
                  geometry.coordinates.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPoint") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line: any) => {
                    line.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPolygon") {
                  geometry.coordinates.forEach((polygon: any) => {
                    polygon.forEach((ring: any) => {
                      ring.forEach((coord: any) => {
                        coordinatePoints.push({
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: coord,
                          },
                          properties: {},
                        });
                      });
                    });
                  });
                }
              });

              // Filter points to only those within the circle radius (in pixels)
              const filteredPoints = coordinatePoints.filter(
                (pointFeature: any) => {
                  const coord = pointFeature.geometry.coordinates;
                  const projectedPoint = maplibreMap.project(coord);

                  const dx = projectedPoint.x - point.x;
                  const dy = projectedPoint.y - point.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  return distance <= currentRadius;
                }
              );

              // Get mouse pointer coordinates in lng/lat
              const mouseLatLng = maplibreMap.unproject([point.x, point.y]);

              // Create spider lines from mouse pointer to each filtered point
              const spiderLines = filteredPoints.map((pointFeature: any) => {
                return {
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [mouseLatLng.lng, mouseLatLng.lat],
                      pointFeature.geometry.coordinates,
                    ],
                  },
                  properties: {
                    spider: true,
                  },
                };
              });

              // Combine points and lines for display
              const allFeatures = [...filteredPoints, ...spiderLines];

              // Update highlight source with points and spider lines
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: allFeatures,
              });
            } else if (mode === "spiderRocket") {
              // Mode 5: Spider Rocket - same as spider but with grey dots, shortest line in red
              const coordinatePoints: any[] = [];

              features.forEach((feature: any) => {
                const geometry = feature.geometry;

                // Extract coordinates based on geometry type
                if (geometry.type === "Point") {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: geometry.coordinates,
                    },
                    properties: { grey: true },
                  });
                } else if (geometry.type === "LineString") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: { grey: true },
                    });
                  });
                } else if (geometry.type === "Polygon") {
                  geometry.coordinates.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: { grey: true },
                      });
                    });
                  });
                } else if (geometry.type === "MultiPoint") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: { grey: true },
                    });
                  });
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line: any) => {
                    line.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: { grey: true },
                      });
                    });
                  });
                } else if (geometry.type === "MultiPolygon") {
                  geometry.coordinates.forEach((polygon: any) => {
                    polygon.forEach((ring: any) => {
                      ring.forEach((coord: any) => {
                        coordinatePoints.push({
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: coord,
                          },
                          properties: { grey: true },
                        });
                      });
                    });
                  });
                }
              });

              // Filter points to only those within the circle radius and calculate distances
              const filteredPointsWithDistance = coordinatePoints
                .map((pointFeature: any) => {
                  const coord = pointFeature.geometry.coordinates;
                  const projectedPoint = maplibreMap.project(coord);

                  const dx = projectedPoint.x - point.x;
                  const dy = projectedPoint.y - point.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  return { pointFeature, distance };
                })
                .filter((item: any) => item.distance <= currentRadius);

              // Find the shortest distance
              let shortestDistance = Infinity;
              let shortestIndex = -1;
              filteredPointsWithDistance.forEach((item: any, index: number) => {
                if (item.distance < shortestDistance) {
                  shortestDistance = item.distance;
                  shortestIndex = index;
                }
              });

              // Get mouse pointer coordinates in lng/lat
              const mouseLatLng = maplibreMap.unproject([point.x, point.y]);

              // Get current tolerance radius
              const currentToleranceRadius = toleranceRadiusRef.current;

              // Create spider lines and points, marking the shortest as red
              const greySpiderLines: any[] = [];
              const redSpiderLines: any[] = [];
              const redPoints: any[] = [];

              // If no points found, show red dot at mouse pointer
              if (shortestIndex === -1) {
                redPoints.push({
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [mouseLatLng.lng, mouseLatLng.lat],
                  },
                  properties: {},
                });
              }

              filteredPointsWithDistance.forEach((item: any, index: number) => {
                const isClosest = index === shortestIndex;

                if (isClosest) {
                  // Check if winning dot is within tolerance radius
                  if (item.distance <= currentToleranceRadius) {
                    // Add red point (only the winning dot if within tolerance)
                    redPoints.push({
                      type: "Feature",
                      geometry: item.pointFeature.geometry,
                      properties: {},
                    });

                    // Add red spider line
                    redSpiderLines.push({
                      type: "Feature",
                      geometry: {
                        type: "LineString",
                        coordinates: [
                          [mouseLatLng.lng, mouseLatLng.lat],
                          item.pointFeature.geometry.coordinates,
                        ],
                      },
                      properties: {},
                    });
                  } else {
                    // Winning dot is outside tolerance - show dot at mouse pointer
                    redPoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: [mouseLatLng.lng, mouseLatLng.lat],
                      },
                      properties: {},
                    });
                  }
                } else {
                  // Add grey spider line (no grey dots)
                  greySpiderLines.push({
                    type: "Feature",
                    geometry: {
                      type: "LineString",
                      coordinates: [
                        [mouseLatLng.lng, mouseLatLng.lat],
                        item.pointFeature.geometry.coordinates,
                      ],
                    },
                    properties: { spider: true },
                  });
                }
              });

              // Combine in order: grey lines, red line, red point
              const allFeatures = [
                ...greySpiderLines,
                ...redSpiderLines,
                ...redPoints,
              ];

              // Update highlight source with grey points and spider lines
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: allFeatures,
              });
            } else if (mode === "serious") {
              // Mode 6: Serious - only show the closest point in black, no lines
              const coordinatePoints: any[] = [];

              features.forEach((feature: any) => {
                const geometry = feature.geometry;

                // Extract coordinates based on geometry type
                if (geometry.type === "Point") {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: geometry.coordinates,
                    },
                    properties: {},
                  });
                } else if (geometry.type === "LineString") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "Polygon") {
                  geometry.coordinates.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPoint") {
                  geometry.coordinates.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line: any) => {
                    line.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                } else if (geometry.type === "MultiPolygon") {
                  geometry.coordinates.forEach((polygon: any) => {
                    polygon.forEach((ring: any) => {
                      ring.forEach((coord: any) => {
                        coordinatePoints.push({
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: coord,
                          },
                          properties: {},
                        });
                      });
                    });
                  });
                }
              });

              // Filter points to only those within the circle radius and calculate distances
              const filteredPointsWithDistance = coordinatePoints
                .map((pointFeature: any) => {
                  const coord = pointFeature.geometry.coordinates;
                  const projectedPoint = maplibreMap.project(coord);

                  const dx = projectedPoint.x - point.x;
                  const dy = projectedPoint.y - point.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  return { pointFeature, distance };
                })
                .filter((item: any) => item.distance <= currentRadius);

              // Find the shortest distance
              let shortestDistance = Infinity;
              let shortestIndex = -1;
              filteredPointsWithDistance.forEach((item: any, index: number) => {
                if (item.distance < shortestDistance) {
                  shortestDistance = item.distance;
                  shortestIndex = index;
                }
              });

              // Get mouse pointer coordinates in lng/lat
              const mouseLatLng = maplibreMap.unproject([point.x, point.y]);

              // Get current tolerance radius
              const currentToleranceRadius = toleranceRadiusRef.current;

              // Only show the closest point in black
              const blackPoint: any[] = [];

              if (shortestIndex === -1) {
                // No points found - show black dot at mouse pointer
                blackPoint.push({
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [mouseLatLng.lng, mouseLatLng.lat],
                  },
                  properties: { black: true },
                });
              } else {
                const closestItem = filteredPointsWithDistance[shortestIndex];

                // Check if winning dot is within tolerance radius
                if (closestItem.distance <= currentToleranceRadius) {
                  // Show black point at the actual closest coordinate
                  blackPoint.push({
                    type: "Feature",
                    geometry: closestItem.pointFeature.geometry,
                    properties: { black: true },
                  });
                } else {
                  // Winning dot is outside tolerance - show dot at mouse pointer
                  blackPoint.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: [mouseLatLng.lng, mouseLatLng.lat],
                    },
                    properties: { black: true, mode: mode },
                  });
                }
              }

              console.log("xxx blackPoint", blackPoint);
              setSeriousClosestPoint(blackPoint[0].geometry.coordinates);

              // Update highlight source with only the black point
              maplibreMap.getSource("highlight").setData({
                type: "FeatureCollection",
                features: blackPoint,
              });
            }
          } else {
            maplibreMap.getCanvas().style.cursor = "";
            // Clear highlights
            maplibreMap.getSource("highlight").setData({
              type: "FeatureCollection",
              features: [],
            });
          }
        }
      };

      const mouseoutHandler = () => {
        // Remove circles when mouse leaves map
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
          toleranceCircleMarkerRef.current = null;
        }
      };

      leafletMap.on("mousemove", mousemoveHandler);
      leafletMap.on("mouseout", mouseoutHandler);

      // Cleanup function to remove listeners and circles
      return () => {
        leafletMap.off("mousemove", mousemoveHandler);
        leafletMap.off("mouseout", mouseoutHandler);
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
          toleranceCircleMarkerRef.current = null;
        }
      };
    }
  }, [routedMapRef, queryRadius, toleranceRadius, maplibreMap, mode]);

  return (
    <div>
      {/* Mode Toggle Buttons and Radius Slider */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          background: "white",
          padding: "10px",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {vectorStyles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
            <VectorLayerButton
              hasSavedVectorStyle={hasSavedVectorStyle}
              onClear={clearVectorStyle}
            />
            <ModeButtons mode={mode} onModeChange={setMode} />
          </div>
        )}

        <RadiusSliders
          queryRadius={queryRadius}
          toleranceRadius={toleranceRadius}
          mode={mode}
          hasVectorLayer={vectorStyles.length > 0}
          onQueryRadiusChange={setQueryRadius}
          onToleranceRadiusChange={setToleranceRadius}
        />
      </div>

      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <MeasurementControl />
        <Control position="bottomleft" order={10}>
          <div style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              pixelwidth={
                responsiveState === "normal"
                  ? "300px"
                  : (windowSize?.width || 300) - gap
              }
            />
          </div>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        key={JSON.stringify(vectorStyles)}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        onclick={(e) => {
          e.originalEvent?.preventDefault();
          console.log("xxx e", e);
          console.log("xxx seriousClosestPoint", seriousClosestPoint);
        }}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
        infoBox={
          selectedFeature && (
            <InfoBox
              pixelwidth={350}
              currentFeature={selectedFeature}
              hideNavigator={true}
              header="Vector Layer Feature"
              headerColor="#ff0000"
              {...selectedFeature?.properties}
              noCurrentFeatureTitle="No feature selected"
              noCurrentFeatureContent="Click on a feature to see details"
              links={links}
              secondaryInfoBoxElements={[
                <InfoBoxFotoPreview
                  key="foto-preview"
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]}
            />
          )
        }
      >
        <MapMeasurementsObjects />
        <TopicMapSelectionContent />
        {vectorStyles.map((style, index) => {
          return (
            <CismapLayer
              key={index}
              {...{
                type: "vector",
                style: style,
                pane: "additionalLayers" + index,
                opacity: 1,
                maxSelectionCount: 1,
                selectionEnabled: true,
                logMapLibreErrors: true,
                onMapLibreCoreMapReady: (map: any) => {
                  setMaplibreMap(map);
                },
                onSelectionChanged: (e: any) => {
                  const selectedFeature = e.hits[0];
                  console.log(
                    "xxxy selectedFeature",
                    JSON.stringify(selectedFeature, null, 2)
                  );

                  const p = selectedFeature.properties;

                  if (p.infobox_info) {
                    selectedFeature.properties = {
                      ...selectedFeature.properties,
                      ...JSON.parse(p.infobox_info),
                    };
                    setSelectedFeature(selectedFeature);
                  } else {
                    //if style has /poi/ in it, then it is a POI layer
                    if (style?.indexOf && style.indexOf("/poi/") > -1) {
                      console.log("xxxx style ", style);

                      const createInfoBoxInfo = (p: any) => {
                        const identifications = JSON.parse(p.identifications);
                        const mainlocationtype =
                          identifications[0].identification;
                        const info = {
                          title: p.geographicidentifier,
                          // additionalInfo: "bbb",
                          subtitle: p.strasse,
                          headerColor: p.schrift,
                          header: mainlocationtype,
                          url: p.url,
                          tel: p.telefon,
                        };
                        return info;
                      };

                      selectedFeature.properties = {
                        ...selectedFeature.properties,
                        ...createInfoBoxInfo(p),
                      };

                      setSelectedFeature(selectedFeature);
                    }
                    //if style has /sgk_hausnummer/ in it
                    else if (
                      style?.indexOf &&
                      style.indexOf("/sgk_hausnummern/") > -1
                    ) {
                      console.log("xxx------");

                      const conf = [
                        "title:p.name+' '+p.hnummer",
                        "header:'Adresse ('+p.adressart+')'",
                        "headerColor:({1: '#006622', 2: '#0000CC', 3: '#FF6600', 4: '#CC0000', 5: '#7030A0'}[p.adresstyp] || '#000000')",
                      ];
                      // // Create the function as a string
                      let functionString = `(function(p) {
                                          const info = {`;

                      conf.forEach((rule) => {
                        functionString += `${rule.trim()},\n`;
                      });

                      functionString += `
                                          };
                                          return info;
                    })`;
                      console.log("xxx functionString", functionString);

                      const tmpInfo = eval(functionString)(p);

                      console.log("xxx tmpInfo", tmpInfo);

                      selectedFeature.properties = {
                        ...selectedFeature.properties,
                        ...tmpInfo,
                      };

                      setSelectedFeature(selectedFeature);
                    }
                  }
                },
              }}
            />
          );
        })}
      </TopicMapComponent>
    </div>
  );
}
