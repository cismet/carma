import { Color, GeoJsonDataSource, PointGraphics, Viewer } from "cesium";
import { buffer, difference, featureCollection } from "@turf/turf";
const BUFFER_WIDTH_METERS = 4;
const FOOTPRINT_COLOR = Color.YELLOW.withAlpha(0.5);

export const linewayPointToId = (line: string, waypoint: string) =>
  `${line}:${waypoint}`;

export const idToLinewayPoint = (id: string) => {
  const [line, waypoint] = id.split(":");
  return { line, waypoint };
};

const prepareWaypoints = (
  waypointFeatures: GeoJSON.FeatureCollection,
  footprintsByWaypointId: { [key: string]: { [key: string]: any } }
) => {
  waypointFeatures.features.forEach((feature: any) => {
    if (feature.geometry && feature.geometry.coordinates) {
      const coordinates = feature.geometry.coordinates;
      const zValue = coordinates[2] || 0; // Assuming the Z value is the third coordinate
      feature.properties.Height = zValue;
      feature.properties.LINE_WAYPOINT = linewayPointToId(
        feature.properties.LINE,
        feature.properties.WAYPOINT
      );
      if (footprintsByWaypointId[feature.properties.LINE_WAYPOINT]) {
        feature.properties.HAS_FOOTPRINT = true;
        feature.properties.ORI_NORTH =
          footprintsByWaypointId[feature.properties.LINE_WAYPOINT][
            "NORD"
          ]?.FILENAME;
        feature.properties.ORI_SOUTH =
          footprintsByWaypointId[feature.properties.LINE_WAYPOINT][
            "SUED"
          ]?.FILENAME;
        feature.properties.ORI_EAST =
          footprintsByWaypointId[feature.properties.LINE_WAYPOINT][
            "OST"
          ]?.FILENAME;
        feature.properties.ORI_WEST =
          footprintsByWaypointId[feature.properties.LINE_WAYPOINT][
            "WEST"
          ]?.FILENAME;
      }
    }
  });
};

const prepareFootprints = (footprintFeatures: GeoJSON.FeatureCollection) => {
  const availableCaptureLocations: { [key: string]: { [key: string]: any } } =
    {};
  footprintFeatures.features.forEach((feature: GeoJSON.Feature) => {
    if (feature.geometry) {
      feature.properties.LINE_WAYPOINT = linewayPointToId(
        feature.properties.LINE,
        feature.properties.WAYPOINT
      );

      // Buffer the geometry by meters
      const buffered = buffer(feature, BUFFER_WIDTH_METERS, {
        units: "meters",
      }) as unknown as GeoJSON.Feature<GeoJSON.Polygon>;

      // Subtract the original geometry from the buffered one
      const outline = difference(
        featureCollection([
          buffered,
          feature as GeoJSON.Feature<GeoJSON.Polygon>,
        ])
      );
      feature.geometry = outline.geometry;

      if (
        availableCaptureLocations[feature.properties.LINE_WAYPOINT] ===
        undefined
      ) {
        availableCaptureLocations[feature.properties.LINE_WAYPOINT] = {
          [feature.properties.ORI]: feature.properties,
        };
      } else {
        availableCaptureLocations[feature.properties.LINE_WAYPOINT][
          feature.properties.ORI
        ] = feature.properties;
      }
    }
  });
  return availableCaptureLocations;
};

export const loadAndPrepareGeoJson = async (
  viewer: Viewer,
  waypointsUrl: string,
  footprintUrl: string
) => {
  try {
    const footprintResponse = await fetch(footprintUrl);
    const footprintJsonData = await footprintResponse.json();
    const footprintsByWaypointId = prepareFootprints(footprintJsonData);
    const footprints = await GeoJsonDataSource.load(footprintJsonData, {
      fill: FOOTPRINT_COLOR,
      clampToGround: true, // Clamp footprints to the tileset
    });

    viewer.dataSources.add(footprints).then(() => {
      footprints.show = false;
      viewer.scene.requestRender();
    });

    const waypointsResponse = await fetch(waypointsUrl);
    const waypointsJsonData = await waypointsResponse.json();

    // Add Z value to properties
    prepareWaypoints(waypointsJsonData, footprintsByWaypointId);

    const waypoints = await GeoJsonDataSource.load(waypointsJsonData, {
      stroke: Color.HOTPINK,
      fill: Color.PINK,
    });
    viewer.dataSources.add(waypoints);

    const pointStyle = new PointGraphics({
      pixelSize: 5,
      color: Color.YELLOW,
    });

    const pointStyleEmpty = new PointGraphics({
      pixelSize: 4,
      color: Color.LIGHTGRAY,
    });

    // Change the style of the markers to circles and remove billboards
    waypoints.entities.values.forEach((entity) => {
      if (entity.position) {
        entity.point = entity.properties.HAS_FOOTPRINT
          ? pointStyle
          : pointStyleEmpty;
        entity.billboard = undefined; // Remove the default billboard
      }
    });
    viewer.scene.requestRender();
    return { waypoints, footprints };
  } catch (error) {
    console.error("Error loading GeoJSON:", error);
  }
};
