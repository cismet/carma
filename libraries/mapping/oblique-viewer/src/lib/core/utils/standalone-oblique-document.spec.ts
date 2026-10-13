// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createStandaloneObliqueDocument } from "./standalone-oblique-document";
import { standalonePreparedFixture } from "./standalone-oblique.test-fixture";

describe("standalone oblique camera dependency closure", () => {
  it("retains the complete used camera/image/conventions and physical geometry", () => {
    const input = standalonePreparedFixture(),
      before = structuredClone(input.metadata),
      doc = createStandaloneObliqueDocument(input);
    const metadata = doc.catalogSnapshot
      .metadata as unknown as typeof input.metadata;
    expect(Object.keys(metadata.images)).toEqual(["photo"]);
    expect(Object.keys(metadata.cameras)).toEqual(["170"]);
    expect(metadata.cameras["170"]).toEqual(input.metadata.cameras["170"]);
    expect(metadata.images.photo).toEqual({
      ...input.metadata.images.photo,
      assets: undefined,
    });
    expect(metadata.conventions).toEqual(input.metadata.conventions);
    expect(doc.catalogSnapshot.operationalPose.cameraEcefMeters).toEqual(
      input.eye.toArray()
    );
    expect(doc.catalogSnapshot.operationalPose.worldToCameraRows).toEqual(
      input.ecefWorldToCameraRows
    );
    expect(doc.catalogSnapshot.recordGeometry).toEqual(input.recordGeometry);
    expect(doc.pixelMapping.calibrationDimensions).toEqual([2048, 1024]);
    expect(doc.pixelMapping.primaryDimensions).toEqual([1024, 512]);
    expect(doc.pixelMapping.levelToSensorAffine["4"]).toEqual([
      [16, 0, 7.5],
      [0, 16, 7.5],
    ]);
    expect(input.metadata).toEqual(before);
  });

  it("removes catalog/original lookup routes while retaining one-camera dataset conventions", () => {
    const input = standalonePreparedFixture(),
      doc = createStandaloneObliqueDocument(input),
      dataset = doc.catalogSnapshot.dataset;
    expect(dataset.exteriorOrientationsURI).toBe("embedded:avif");
    for (const key of [
      "compressedCatalogURI",
      "directionalCatalogs",
      "footprintsURI",
      "originalImageUrlTemplate",
      "avifPyramidTemplate",
      "downloadPath",
      "inlineCatalog",
    ])
      expect(dataset[key]).toBeUndefined();
    expect(Object.keys(dataset.cameras as object)).toEqual(["170"]);
    expect(dataset.cameraIdToDirection).toEqual(
      input.dataset.cameraIdToDirection
    );
    expect(dataset.sourceConventions).toEqual(input.dataset.sourceConventions);
  });

  it("requires a prepared ECEF pose and camera calibration", () => {
    const input = standalonePreparedFixture();
    delete input.metadata.images.photo.cameraEcefMeters;
    expect(() => createStandaloneObliqueDocument(input)).toThrow(/Prepared/);
  });
});
