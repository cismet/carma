import {
  MEASUREMENT_ITEM_TYPES,
  getMeasurementTypeKeyword,
  getMeasurementTypeLabel,
  getMeasurementTypeTag,
  resolveMeasurementTypesFromFeatureStyle,
  resolveMeasurementTypesFromItem,
  resolveMeasurementTypesFromVectorStyle,
} from "./measurement-layer-types";

describe("measurement-layer-types helper", () => {
  it("resolves measurement types from geojson-backed vector styles", () => {
    expect(
      resolveMeasurementTypesFromFeatureStyle({
        sources: {
          adhoc: {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [7.1, 51.2] },
                },
                {
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [7.1, 51.2],
                      [7.2, 51.3],
                    ],
                  },
                },
                {
                  type: "Feature",
                  geometry: {
                    type: "Polygon",
                    coordinates: [
                      [
                        [7.1, 51.2],
                        [7.2, 51.2],
                        [7.2, 51.3],
                        [7.1, 51.2],
                      ],
                    ],
                  },
                },
              ],
            },
          },
        },
      })
    ).toEqual([
      MEASUREMENT_ITEM_TYPES.POINT,
      MEASUREMENT_ITEM_TYPES.DISTANCE,
      MEASUREMENT_ITEM_TYPES.AREA,
    ]);
  });

  it("falls back to measurement keywords when vector styles are unavailable", () => {
    expect(
      resolveMeasurementTypesFromItem({
        vectorStyle: undefined,
        keywords: [
          getMeasurementTypeKeyword(MEASUREMENT_ITEM_TYPES.DISTANCE),
          getMeasurementTypeKeyword(MEASUREMENT_ITEM_TYPES.AREA),
        ],
      })
    ).toEqual([MEASUREMENT_ITEM_TYPES.DISTANCE, MEASUREMENT_ITEM_TYPES.AREA]);
  });

  it("returns no measurement type for malformed vector style payloads", () => {
    expect(resolveMeasurementTypesFromVectorStyle("{bad json")).toEqual([]);
  });

  it("formats display labels, tags and keywords consistently", () => {
    expect(getMeasurementTypeLabel(MEASUREMENT_ITEM_TYPES.POINT)).toBe(
      "Punktmessung"
    );
    expect(getMeasurementTypeTag(MEASUREMENT_ITEM_TYPES.AREA)).toBe(
      "Messung: Flächenmessung"
    );
    expect(getMeasurementTypeKeyword(MEASUREMENT_ITEM_TYPES.DISTANCE)).toBe(
      "measurement-type:distance"
    );
  });
});
