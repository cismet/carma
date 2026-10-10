// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getGcg2016HeightAnomalies } from "@carma-geo/proj";
import { createStandaloneObliqueDocument } from "../../core/utils/standalone-oblique-document";
import { standalonePreparedFixture } from "../../core/utils/standalone-oblique.test-fixture";
import { datasetFromStandaloneAvif } from "./adhoc-oblique-datasets";
import { loadObliqueSeriesData } from "./load-oblique-series";
vi.mock("@carma-geo/proj", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGcg2016HeightAnomalies: vi.fn(() => {
    throw Error("Prepared standalone pose must not load a geoid");
  }),
}));

describe("embedded standalone oblique dataset", () => {
  it("restores an inline-only dataset without trusting asset or catalog URLs", async () => {
    const input = standalonePreparedFixture(),
      doc = createStandaloneObliqueDocument(input),
      before = structuredClone(doc),
      dataset = datasetFromStandaloneAvif(doc, "blob:sample", "adhoc-file-one");
    const fetchSource = vi.fn(async () => {
      throw Error("Inline catalogue must not fetch");
    });
    const result = await loadObliqueSeriesData(
      dataset,
      new AbortController().signal,
      fetchSource
    );
    expect(fetchSource).not.toHaveBeenCalled();
    expect(getGcg2016HeightAnomalies).not.toHaveBeenCalled();
    expect(dataset.avifOnly).toBe(true);
    expect(dataset.availableCameraViews).toEqual(["front"]);
    expect(dataset.heightDatum).toBe("dhhn2016");
    expect(dataset.exteriorOrientationsURI).toBe("embedded:avif");
    expect(dataset.compressedCatalogURI).toBeUndefined();
    expect(dataset.footprintsURI).toBeUndefined();
    expect(dataset.originalImageUrlTemplate).toBeUndefined();
    expect(result.imageRecords.size).toBe(1);
    const record = [...result.imageRecords.values()][0];
    expect(record.sourceId).toBe("photo");
    expect(record.seriesId).toBe("adhoc-file-one");
    expect(record.cameraEcefMeters).toEqual(input.eye.toArray());
    expect(record.z).toBe(1000);
    expect(record.catalogCenter).toEqual(input.recordGeometry.catalogCenter);
    expect(record.footprint).toEqual(input.recordGeometry.footprint);
    expect(record.assets).toEqual({
      pyramid: { href: "blob:sample", type: "image/avif", roles: ["data"] },
    });
    expect(doc).toEqual(before);
  });

  it.each([
    "missing camera",
    "inconsistent eye",
    "wrong datum",
    "wrong sensor",
    "mirrored pixels",
    "non-finite pose",
  ])("rejects %s before installing a dataset", (problem) => {
    const doc = createStandaloneObliqueDocument(standalonePreparedFixture()),
      metadata = doc.catalogSnapshot.metadata as unknown as ReturnType<
        typeof standalonePreparedFixture
      >["metadata"];
    if (problem === "missing camera") delete metadata.cameras["170"];
    if (problem === "inconsistent eye")
      doc.catalogSnapshot.operationalPose.cameraEcefMeters[0] += 1;
    if (problem === "wrong datum")
      metadata.conventions.verticalDatum = "unknown";
    if (problem === "wrong sensor") doc.pixelMapping.primaryDimensions[0] -= 1;
    if (problem === "mirrored pixels")
      doc.pixelMapping.levelToSensorAffine["2"][0][0] = -4;
    if (problem === "non-finite pose")
      doc.catalogSnapshot.operationalPose.worldToCameraRows[0][0] = Number.NaN;
    expect(() =>
      datasetFromStandaloneAvif(doc, "blob:invalid", "reject-one")
    ).toThrow();
  });
});
