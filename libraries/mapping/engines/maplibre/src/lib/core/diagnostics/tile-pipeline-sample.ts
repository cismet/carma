import { TILES_LOAD_POLICY } from "../tile-load-config";
/** Window totals, not resident bytes or estimates of wire bandwidth. */
export type TilePipelineTotals = ReturnType<typeof emptyTilePipelineTotals>;

export const emptyTilePipelineTotals = () => ({
  responses: 0,
  meshResponses: 0,
  metadataResponses: 0,
  sizedResponses: 0,
  wireSizedResponses: 0,
  metadataReady: 0,
  headers: 0,
  headersMs: 0,
  decodedBytes: 0,
  decodedBodies: 0,
  wireBytes: 0,
  fileBytes: 0,
  responseMs: 0,
  timedResponses: 0,
  ttfbMs: 0,
  bodyMs: 0,
  timedBodies: 0,
  prepared: 0,
  timedPreparations: 0,
  prepareMs: 0,
  parseWaitMs: 0,
  timedParseWaits: 0,
  presented: 0,
  errors: 0,
});

export type TileResourceTiming = Pick<
  PerformanceResourceTiming,
  | "name"
  | "duration"
  | "transferSize"
  | "encodedBodySize"
  | "requestStart"
  | "responseStart"
  | "responseEnd"
>;

/** Zero transfer with a known body is a cache hit; two zero sizes are unknown. */
export const addTileResourceTiming = (
  totals: TilePipelineTotals,
  entry: TileResourceTiming,
  observation?: { contentLength?: number; bodyReadMs?: number }
): TilePipelineTotals => {
  const { contentLength, bodyReadMs } = observation ?? {};
  const sized = entry.transferSize > 0 || entry.encodedBodySize > 0;
  const fileBytes =
    entry.encodedBodySize ||
    (Number.isFinite(contentLength) && contentLength! > 0 ? contentLength! : 0);
  const fileSized = sized || fileBytes > 0;
  const timed =
    entry.requestStart > 0 && entry.responseStart >= entry.requestStart;
  const bodyMs = timed ? entry.responseEnd - entry.responseStart : bodyReadMs;
  const bodyTimed =
    bodyMs !== undefined && Number.isFinite(bodyMs) && bodyMs >= 0;
  return {
    ...totals,
    responses: totals.responses + 1,
    meshResponses:
      totals.meshResponses +
      Number(/\.(b3dm|glb|gltf|pnts|i3dm|cmpt)(?:[?#]|$)/i.test(entry.name)),
    metadataResponses:
      totals.metadataResponses + Number(/\.json(?:[?#]|$)/i.test(entry.name)),
    sizedResponses: totals.sizedResponses + Number(fileSized),
    wireSizedResponses: totals.wireSizedResponses + Number(sized),
    wireBytes: totals.wireBytes + entry.transferSize,
    fileBytes: totals.fileBytes + fileBytes,
    responseMs: totals.responseMs + entry.duration,
    timedResponses: totals.timedResponses + Number(timed),
    ttfbMs:
      totals.ttfbMs + (timed ? entry.responseStart - entry.requestStart : 0),
    bodyMs: totals.bodyMs + (bodyTimed ? bodyMs! : 0),
    timedBodies: totals.timedBodies + Number(bodyTimed),
  };
};

export const sampleTilePipeline = (
  totals: TilePipelineTotals,
  elapsedMs: number
) => {
  const seconds = Math.max(1, elapsedMs) / 1000;
  const mean = (sum: number, count: number) =>
    count ? sum / count : Number.NaN;
  const sizesKnown = totals.responses === totals.sizedResponses;
  return {
    responsesPerS: totals.responses / seconds,
    downloadsPerS: totals.meshResponses / seconds,
    metadataPerS: totals.metadataResponses / seconds,
    metadataReadyPerS: totals.metadataReady / seconds,
    headersMs: mean(totals.headersMs, totals.headers),
    decodedMiBs: totals.decodedBytes / 2 ** 20 / seconds,
    decodedFileKiB: mean(totals.decodedBytes / 1024, totals.decodedBodies),
    downloadMiBs:
      totals.responses === totals.wireSizedResponses
        ? totals.wireBytes / 2 ** 20 / seconds
        : Number.NaN,
    fileMiBs: sizesKnown ? totals.fileBytes / 2 ** 20 / seconds : Number.NaN,
    fileKiB: mean(totals.fileBytes / 1024, totals.sizedResponses),
    timingCoverage: totals.responses
      ? (100 * totals.sizedResponses) / totals.responses
      : Number.NaN,
    downloadMs: mean(totals.responseMs, totals.responses),
    ttfbMs: mean(totals.ttfbMs, totals.timedResponses),
    bodyMs: mean(totals.bodyMs, totals.timedBodies),
    preparedPerS: totals.prepared / seconds,
    prepareMs: mean(totals.prepareMs, totals.timedPreparations),
    parseWaitMs: mean(totals.parseWaitMs, totals.timedParseWaits),
    presentedPerS: totals.presented / seconds,
    errorsPerS: totals.errors / seconds,
  };
};

/** CSS-pixel geometric SSE weighted by clipped tile-bounds footprints. Bounds
 * may overlap and include occluded geometry: this is not framebuffer error or
 * the fraction of actual screen pixels exceeding the threshold.
 */
export type VisibleTileQualityObservation = Readonly<{
  errorCssPixels: number;
  areaCssPixels: number;
}>;

export const sampleVisibleTileQuality = (
  observations: readonly VisibleTileQualityObservation[],
  now: number,
  previousOver20Since: number | null = null
) => {
  let maximum = Number.NEGATIVE_INFINITY;
  let weightedError = 0;
  let area = 0;
  let over20Area = 0;
  let known = 0;
  for (const observation of observations) {
    const { errorCssPixels, areaCssPixels } = observation;
    if (
      !Number.isFinite(errorCssPixels) ||
      errorCssPixels < 0 ||
      !Number.isFinite(areaCssPixels) ||
      areaCssPixels <= 0
    )
      continue;
    known++;
    maximum = Math.max(maximum, errorCssPixels);
    weightedError += errorCssPixels * areaCssPixels;
    area += areaCssPixels;
    if (errorCssPixels > TILES_LOAD_POLICY.coarseRefinementErrorPixels)
      over20Area += areaCssPixels;
  }
  const over20Since = over20Area > 0 ? previousOver20Since ?? now : null;
  const unknown = observations.length - known;
  return {
    over20Since,
    metrics: {
      visibleErrorMaxPx: known ? maximum : Number.NaN,
      visibleErrorMeanPx: area ? weightedError / area : Number.NaN,
      visibleOver20Percent: area ? (100 * over20Area) / area : Number.NaN,
      visibleOver20Ms:
        over20Since !== null
          ? Math.max(0, now - over20Since)
          : known && unknown === 0
          ? 0
          : Number.NaN,
      visibleErrorKnownTiles: known,
      visibleErrorUnknownTiles: unknown,
    },
  };
};
