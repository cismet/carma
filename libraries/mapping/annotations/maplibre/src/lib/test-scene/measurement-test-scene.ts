/**
 * The Rathaus Barmen courtyard on the Mesh 2024: one measurement of every
 * type, each partly hidden by the pavilion or the dormer. The measurement
 * scene story and the geoportal test scene start from it. It is a GeoJSON
 * export of the annotations runtime, so it goes in wherever a shared set
 * does, and it stays out of every bundle until one of them asks for it.
 */
export const loadMeasurement3dTestSceneMeasurements =
  async (): Promise<unknown> =>
    (await import("./rathaus-barmen-measurements.json")).default;
