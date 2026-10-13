// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getGcg2016HeightAnomalies } from "@carma-geo/proj";
import { createStandaloneObliqueDocument } from "../../core/utils/standalone-oblique-document";
import { standalonePreparedFixture } from "../../core/utils/standalone-oblique.test-fixture";
import {
  datasetFromStandaloneAvif,
  registerAdHocObliqueAvif,
} from "./adhoc-oblique-datasets";
import { loadObliqueSeriesData } from "./load-oblique-series";
const openStandalone = vi.hoisted(() => vi.fn());
vi.mock("@carma-commons/image-pyramid", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openStandaloneAvif: openStandalone,
}));
vi.mock("@carma-geo/proj", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGcg2016HeightAnomalies: vi.fn(() => {
    throw Error("Prepared standalone pose must not load a geoid");
  }),
}));

describe("embedded standalone oblique dataset", () => {
  it("registers and releases distinct local datasets without crypto.randomUUID", async () => {
    const doc = createStandaloneObliqueDocument(standalonePreparedFixture());
    const [width, height] = doc.pixelMapping.primaryDimensions;
    const release = vi.fn();
    openStandalone.mockResolvedValue({
      document: doc,
      url: "blob:local-drop",
      layout: { index: { dimensions: { width, height } } },
      release,
    });
    vi.stubGlobal("crypto", {});
    const registered: Awaited<ReturnType<typeof registerAdHocObliqueAvif>>[] =
      [];
    try {
      for (let i = 0; i < 2; i++) {
        registered.push(
          await registerAdHocObliqueAvif(
            new Blob(),
            new AbortController().signal,
            { name: "018_138_176000435.avif" }
          )
        );
      }
      expect(registered[0].id).toMatch(/^adhoc-avif-[0-9a-f-]{36}$/i);
      expect(registered[1].id).not.toBe(registered[0].id);
      expect(registered[0].dataset.avifOnly).toBe(true);
      expect(registered[0].dataset.label).toBe("018_138_176000435.avif");
      expect(registered[0].sourceId).toBe(doc.catalogSnapshot.sourceId);
      registered[0].release();
      registered[0].release();
      expect(release).toHaveBeenCalledTimes(1);
      registered[1].release();
      expect(release).toHaveBeenCalledTimes(2);
    } finally {
      registered.forEach((entry) => entry.release());
      vi.unstubAllGlobals();
      openStandalone.mockReset();
    }
  });

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
