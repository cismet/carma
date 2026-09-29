import type { Show } from "./show";

/**
 * How a show is stored in ceepr: gzip-packed, as base64 in a small JSON
 * envelope. ceepr takes JSON bodies of at most 100 kB (`MAX_SHOW_BYTES`), and
 * every scene carries the whole configuration of its layers and base map, so
 * a plain show fills that after a few stories; packed it takes about a tenth.
 * Shows stored before are plain and are read as they are.
 */
export const PACKED_SHOW_FORMAT = "carma-pm-show-gzip";
export const PACKED_SHOW_VERSION = 1;

export type PackedShow = {
  format: typeof PACKED_SHOW_FORMAT;
  version: typeof PACKED_SHOW_VERSION;
  /** base64 of the gzip of the show's JSON */
  data: string;
};

export const isPackedShow = (value: unknown): value is PackedShow =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>)["format"] === PACKED_SHOW_FORMAT &&
  (value as Record<string, unknown>)["version"] === PACKED_SHOW_VERSION &&
  typeof (value as Record<string, unknown>)["data"] === "string";

const through = async (
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await new Response(
      (new Response(bytes).body as ReadableStream<Uint8Array>).pipeThrough(
        transform
      )
    ).arrayBuffer()
  );

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  // in slices: spreading a whole show into one call overflows the stack
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export const packShow = async (show: Show): Promise<PackedShow> => ({
  format: PACKED_SHOW_FORMAT,
  version: PACKED_SHOW_VERSION,
  data: toBase64(
    await through(
      new TextEncoder().encode(JSON.stringify(show)),
      new CompressionStream("gzip")
    )
  ),
});

/**
 * What a stored document holds: the unpacked content of a packed show,
 * anything else as it is. Rejects when packed data does not unpack.
 */
export const unpackStored = async (value: unknown): Promise<unknown> =>
  isPackedShow(value)
    ? JSON.parse(
        new TextDecoder().decode(
          await through(fromBase64(value.data), new DecompressionStream("gzip"))
        )
      )
    : value;

/** the bytes a publish sends for this show, to hold against `MAX_SHOW_BYTES` */
export const storedShowByteSize = async (show: Show): Promise<number> =>
  new TextEncoder().encode(JSON.stringify(await packShow(show))).length;
