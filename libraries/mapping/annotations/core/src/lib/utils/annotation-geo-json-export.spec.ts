import type { GeometryCollection, Point, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { Cartesian3 } from "@carma-cesium";
import { getDegreesFromCartesian } from "@carma-mapping/engines/cesium/core";

import type { PointAnnotationEntry } from "../types/annotation-cesium-types";
import {
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type NodeChainAnnotation,
} from "../types/annotation-types";
import type { PointDistanceRelation } from "../types/distance-relation";
import { buildAnnotationGeoJsonFeatureCollection } from "./annotation-geo-json-export";
const buildPointAnnotation = ({
  id,
  type,
  longitude,
  latitude,
  altitude,
  name,
}: {
  id: string;
  type: PointAnnotationEntry["type"];
  longitude: number;
  latitude: number;
  altitude: number;
  name?: string;
}): PointAnnotationEntry => {
  const geometryECEF = Cartesian3.fromDegrees(longitude, latitude, altitude);
  const geometryWGS84 = getDegreesFromCartesian(geometryECEF);

  return {
    id,
    type,
    timestamp: 1,
    name,
    geometryECEF,
    geometryWGS84: {
      longitude: geometryWGS84.longitude,
      latitude: geometryWGS84.latitude,
      altitude: geometryWGS84.altitude ?? altitude,
    },
  };
};

describe("annotationGeoJsonExport", () => {
  it("exports point annotations as a GeoJSON point feature", () => {
    const pointAnnotation = buildPointAnnotation({
      id: "point-1",
      type: ANNOTATION_TYPE_POINT,
      longitude: 7.1234,
      latitude: 51.2345,
      altitude: 120,
      name: "Example point",
    });

    const featureCollection = buildAnnotationGeoJsonFeatureCollection({
      annotationId: pointAnnotation.id,
      annotations: [pointAnnotation],
      nodeChainAnnotations: [],
      distanceRelations: [],
    });

    expect(featureCollection).not.toBeNull();
    expect(featureCollection?.features).toHaveLength(1);
    expect(featureCollection?.features[0].geometry.type).toBe("Point");
    expect(
      (featureCollection?.features[0].geometry as Point).coordinates[0]
    ).toBeCloseTo(7.1234, 6);
    expect(
      (featureCollection?.features[0].geometry as Point).coordinates[1]
    ).toBeCloseTo(51.2345, 6);
    expect(featureCollection?.features[0].properties).toMatchObject({
      annotationId: "point-1",
      annotationKind: ANNOTATION_TYPE_POINT,
    });
  });

  it("exports distance annotations as a GeoJSON geometry collection", () => {
    const distancePoint = buildPointAnnotation({
      id: "distance-1",
      type: ANNOTATION_TYPE_DISTANCE,
      longitude: 7.1,
      latitude: 51.2,
      altitude: 100,
    });
    const targetPoint = buildPointAnnotation({
      id: "point-2",
      type: ANNOTATION_TYPE_POINT,
      longitude: 7.1004,
      latitude: 51.2002,
      altitude: 105,
    });
    const relation: PointDistanceRelation = {
      id: "distance-relation-1",
      edgeId: "edge-1",
      pointAId: distancePoint.id,
      pointBId: targetPoint.id,
      anchorPointId: distancePoint.id,
    };

    const featureCollection = buildAnnotationGeoJsonFeatureCollection({
      annotationId: distancePoint.id,
      annotations: [distancePoint, targetPoint],
      nodeChainAnnotations: [],
      distanceRelations: [relation],
    });

    expect(featureCollection).not.toBeNull();
    expect(featureCollection?.features).toHaveLength(1);
    expect(featureCollection?.features[0].geometry.type).toBe(
      "GeometryCollection"
    );
    expect(
      (featureCollection?.features[0].geometry as GeometryCollection).geometries
    ).toHaveLength(3);
    expect(featureCollection?.features[0].properties).toMatchObject({
      annotationId: "distance-1",
      annotationKind: ANNOTATION_TYPE_DISTANCE,
    });
    expect(featureCollection?.features[0].properties?.relations).toHaveLength(
      1
    );
    expect(
      featureCollection?.features[0].properties?.relatedPoints
    ).toHaveLength(1);
  });

  it("exports node-chain area annotations as a GeoJSON polygon", () => {
    const pointA = buildPointAnnotation({
      id: "point-a",
      type: ANNOTATION_TYPE_POINT,
      longitude: 7.0,
      latitude: 51.0,
      altitude: 100,
    });
    const pointB = buildPointAnnotation({
      id: "point-b",
      type: ANNOTATION_TYPE_POINT,
      longitude: 7.001,
      latitude: 51.0,
      altitude: 100,
    });
    const pointC = buildPointAnnotation({
      id: "point-c",
      type: ANNOTATION_TYPE_POINT,
      longitude: 7.001,
      latitude: 51.001,
      altitude: 100,
    });
    const nodeChainAnnotation: NodeChainAnnotation = {
      id: "area-1",
      type: ANNOTATION_TYPE_AREA_PLANAR,
      nodeIds: [pointA.id, pointB.id, pointC.id],
      edgeRelationIds: [],
      closed: true,
      planeLocked: false,
    };

    const featureCollection = buildAnnotationGeoJsonFeatureCollection({
      annotationId: nodeChainAnnotation.id,
      annotations: [pointA, pointB, pointC],
      nodeChainAnnotations: [nodeChainAnnotation],
      distanceRelations: [],
    });

    expect(featureCollection).not.toBeNull();
    expect(featureCollection?.features).toHaveLength(1);
    expect(featureCollection?.features[0].geometry.type).toBe("Polygon");
    expect(
      (featureCollection?.features[0].geometry as Polygon).coordinates[0] ?? []
    ).toHaveLength(4);
    expect(featureCollection?.features[0].properties).toMatchObject({
      annotationId: "area-1",
      annotationKind: ANNOTATION_TYPE_AREA_PLANAR,
    });
    expect(featureCollection?.features[0].properties?.nodes).toHaveLength(3);
  });
});
