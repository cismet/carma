import type {
  ImageQualityVariant,
  ImageQualitySource,
} from "../../core/utils/image-quality-comparison";

export type ComparisonReply = {
  generation: number;
  bitmap?: ImageBitmap;
  bounds?: readonly [number, number, number, number];
  requestedBytes?: number;
  loadMs?: number;
  decodeMs?: number;
  tileCount?: number;
  bitmapHits?: number;
  error?: string;
};

/** Use the benchmark's actual range reader in a worker, including cross-origin Storybook hosts. */
export const createComparisonClient = (
  workerUrl: string,
  onReply: (reply: ComparisonReply) => void
) => {
  const entry = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(workerUrl)};`], {
      type: "text/javascript",
    })
  );
  const worker = new Worker(entry, { type: "module" });
  let generation = 0;
  worker.onmessage = ({ data }: MessageEvent<ComparisonReply>) => {
    if (data.generation !== generation) {
      data.bitmap?.close();
      return;
    }
    onReply(data);
  };
  worker.onerror = (event) =>
    onReply({ generation, error: event.message || "Image worker failed" });
  return {
    load(
      variant: ImageQualityVariant,
      bounds: readonly [number, number, number, number]
    ) {
      worker.postMessage({
        type: "load",
        generation: ++generation,
        url: variant.href,
        encodedBytes: variant.bytes,
        bounds,
      });
    },
    loadReference(
      source: ImageQualitySource,
      bounds: readonly [number, number, number, number]
    ) {
      worker.postMessage({
        type: "reference",
        generation: ++generation,
        reference: source.referenceTiles,
        bounds,
      });
    },
    loadError(
      variant: ImageQualityVariant,
      bounds: readonly [number, number, number, number]
    ) {
      if (!variant.errorTiles)
        throw new Error("Missing offline RGB-error tiles");
      worker.postMessage({
        type: "reference",
        generation: ++generation,
        reference: variant.errorTiles,
        bounds,
      });
    },
    cancel() {
      worker.postMessage({ type: "cancel", generation: ++generation });
    },
    dispose() {
      worker.terminate();
      URL.revokeObjectURL(entry);
    },
  };
};
