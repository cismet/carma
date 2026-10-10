import { AvifHttpError } from "./avif-source-errors";
import type { AvifRange } from "../core/avif-grid-index";

type Priority = "high" | "low";
type Limits = { maxParts?: number; maxBytes?: number; maxSingleBytes?: number };
export type AvifRangeTransportRequest = {
  url: string;
  ranges: readonly AvifRange[];
  signal: AbortSignal;
  priority?: Priority;
  cache?: RequestCache;
  /** A small sparse batch can use concurrent singles within the same queue. */
  preferSingle?: boolean;
  /** Single discovery range only: accept a response ending at resource EOF. */
  allowShort?: boolean;
  /** Runs for each wire request, including fallback; callers own accounting. */
  onRequest?: (ranges: readonly AvifRange[]) => void;
  /** Validate asset identity before reading or publishing any response bytes. */
  onResponse?: (response: Response) => void;
  /** Validated Single response prefix, owned bytes; not a complete/cacheable range.
   * Earlier prefixes remain valid if a later tail is aborted or incomplete. */
  onProgress?: (range: AvifRange, bytes: Uint8Array) => void;
  /** Exact requested range, in independent owned storage; response order may vary. */
  onPart: (range: AvifRange, bytes: Uint8Array) => void;
};
export type AvifPrefixTransportRequest = {
  url: string;
  signal: AbortSignal;
  priority?: Priority;
  /** Limits bytes consumed from the stream, not bytes already in network buffers. */
  maxBytes: number;
  /** Optional contiguous HTTP windows; a server ignoring the first Range may still stream a prefix. */
  rangeBytes?: number;
  onRequest?: () => void;
  onResponse?: (response: Response) => void;
  onBytes?: (bytes: number) => void;
  /** Return true once a complete independently usable prefix is available. */
  onChunk: (bytes: Uint8Array) => boolean;
};
const DEFAULT_BYTES = 4 * 1024 * 1024;
const DEFAULT_SINGLE_BYTES = DEFAULT_BYTES;
const DEFAULT_PARTS = 8;
const HEADER_LIMIT = 8192;
const endOf = (range: AvifRange) => range.offset + range.length;
const abortError = () =>
  new DOMException("Range request aborted", "AbortError");

/** Merge only overlapping/touching intervals; never buy gap bytes to save a request. */
export const planAvifRangeRequests = (
  input: readonly AvifRange[],
  {
    maxParts = DEFAULT_PARTS,
    maxBytes = DEFAULT_BYTES,
    maxSingleBytes = DEFAULT_SINGLE_BYTES,
  }: Limits = {}
): AvifRange[][] => {
  if (
    !Number.isSafeInteger(maxParts) ||
    maxParts < 1 ||
    maxParts > DEFAULT_PARTS ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > DEFAULT_BYTES ||
    !Number.isSafeInteger(maxSingleBytes) ||
    maxSingleBytes < maxBytes ||
    maxSingleBytes > DEFAULT_SINGLE_BYTES
  )
    throw new RangeError("Invalid bounded range limits");
  const merged: AvifRange[] = [];
  for (const range of [...input].sort((a, b) => a.offset - b.offset)) {
    if (
      !Number.isSafeInteger(range.offset) ||
      range.offset < 0 ||
      !Number.isSafeInteger(range.length) ||
      range.length <= 0 ||
      !Number.isSafeInteger(endOf(range))
    )
      throw new RangeError("Invalid byte range");
    const previous = merged.at(-1);
    if (previous && range.offset <= endOf(previous))
      previous.length =
        Math.max(endOf(previous), endOf(range)) - previous.offset;
    else merged.push({ offset: range.offset, length: range.length });
  }
  const groups: AvifRange[][] = [];
  let parts: AvifRange[] = [],
    used = 0;
  for (const range of merged) {
    if (range.length > maxBytes) {
      if (parts.length) {
        groups.push(parts);
        parts = [];
        used = 0;
      }
      // A caller may lower the disjoint-part budget without splitting otherwise
      // bounded contiguous payloads into extra round trips.
      for (
        let offset = range.offset;
        offset < endOf(range);
        offset += maxSingleBytes
      )
        groups.push([
          { offset, length: Math.min(maxSingleBytes, endOf(range) - offset) },
        ]);
      continue;
    }
    if (parts.length === maxParts || used + range.length > maxBytes) {
      groups.push(parts);
      parts = [];
      used = 0;
    }
    parts.push(range);
    used += range.length;
  }
  if (parts.length) groups.push(parts);
  return groups;
};

class UnsupportedMultiRange extends Error {}
const contentRange = (value: string | null) => {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value?.trim() ?? "");
  if (!match) throw new Error("Invalid Content-Range");
  const start = Number(match[1]),
    end = Number(match[2]);
  const total = match[3] === "*" ? undefined : Number(match[3]);
  if (
    ![start, end].every(Number.isSafeInteger) ||
    start < 0 ||
    end < start ||
    (total !== undefined && (!Number.isSafeInteger(total) || total <= end)) ||
    !Number.isSafeInteger(end - start + 1)
  )
    throw new Error("Out-of-bounds Content-Range");
  return { offset: start, length: end - start + 1, total };
};

/** Exact-length reads make binary payload boundaries unambiguous, even when
 * the AVIF bytes contain the MIME boundary itself or network chunks split it. */
class BoundedReader {
  private chunk = new Uint8Array(0);
  private offset = 0;
  private received = 0;
  private ended = false;
  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private limit: number,
    private signal: AbortSignal
  ) {}
  private async fill(): Promise<boolean> {
    this.signal.throwIfAborted();
    if (this.offset < this.chunk.length) return true;
    if (this.ended) return false;
    const { value, done } = await this.reader.read();
    this.signal.throwIfAborted();
    if (done) {
      this.ended = true;
      this.chunk = new Uint8Array(0);
      return false;
    }
    this.received += value.byteLength;
    if (this.received > this.limit)
      throw new Error("Range response exceeds byte limit");
    this.chunk = value;
    this.offset = 0;
    return value.length ? true : this.fill();
  }
  async exact(
    length: number,
    progress?: (offset: number, bytes: Uint8Array) => void
  ) {
    const bytes = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (!(await this.fill())) throw new Error("Incomplete range response");
      const count = Math.min(length - written, this.chunk.length - this.offset);
      bytes.set(this.chunk.subarray(this.offset, this.offset + count), written);
      this.offset += count;
      written += count;
      if (progress) {
        this.signal.throwIfAborted();
        progress(written - count, bytes.slice(written - count, written));
      }
    }
    return bytes;
  }
  async upTo(length: number) {
    const bytes = new Uint8Array(length);
    let written = 0;
    while (await this.fill()) {
      const count = this.chunk.length - this.offset;
      if (written + count > length)
        throw new Error("Range response length mismatch");
      bytes.set(this.chunk.subarray(this.offset), written);
      written += count;
      this.offset = this.chunk.length;
    }
    return written === length ? bytes : bytes.slice(0, written);
  }
  async line(allowFinal = false): Promise<string> {
    const bytes: number[] = [];
    while (await this.fill()) {
      while (this.offset < this.chunk.length) {
        const value = this.chunk[this.offset++];
        if (value === 10) {
          if (bytes.pop() !== 13)
            throw new Error("Invalid multipart line ending");
          return new TextDecoder().decode(new Uint8Array(bytes));
        }
        bytes.push(value);
        if (bytes.length > HEADER_LIMIT)
          throw new Error("Multipart header too large");
      }
    }
    if (allowFinal) return new TextDecoder().decode(new Uint8Array(bytes));
    throw new Error("Incomplete multipart headers");
  }
  get receivedBytes() {
    return this.received;
  }
  async end() {
    while (await this.fill()) {
      for (; this.offset < this.chunk.length; this.offset++)
        if (this.chunk[this.offset] !== 13 && this.chunk[this.offset] !== 10)
          throw new Error("Range response length mismatch");
    }
  }
  async exactEnd() {
    if (await this.fill()) throw new Error("Range response length mismatch");
  }
}

type QueueJob = {
  priority: Priority;
  signal: AbortSignal;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  abort: () => void;
};
/** Internal shared transport. No cache, AVIF parser, decoder or source lifetime ownership. */
export const createAvifRangeTransport = (
  options: Limits & { concurrency?: number; fetch?: typeof fetch } = {}
) => {
  const maxBytes = options.maxBytes ?? DEFAULT_BYTES;
  const maxParts = options.maxParts ?? DEFAULT_PARTS;
  const maxSingleBytes = options.maxSingleBytes ?? DEFAULT_SINGLE_BYTES;
  planAvifRangeRequests([], { maxBytes, maxParts, maxSingleBytes });
  const concurrency = options.concurrency ?? 3;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 3)
    throw new RangeError("Invalid range concurrency");
  const fetchRange =
    options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const controller = new AbortController();
  const singlesOnly = new Map<string, true>();
  const queue: QueueJob[] = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) {
      const high = queue.findIndex((job) => job.priority === "high");
      const job = queue.splice(high < 0 ? 0 : high, 1)[0];
      job.signal.removeEventListener("abort", job.abort);
      if (job.signal.aborted) {
        job.reject(abortError());
        continue;
      }
      active++;
      void job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  };
  const schedule = (
    signal: AbortSignal,
    priority: Priority,
    run: () => Promise<void>
  ) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const job: QueueJob = {
        signal,
        priority,
        run,
        resolve,
        reject,
        abort: () => {
          const index = queue.indexOf(job);
          if (index >= 0) {
            queue.splice(index, 1);
            reject(abortError());
          }
        },
      };
      signal.addEventListener("abort", job.abort, { once: true });
      queue.push(job);
      pump();
    });
  const disableMulti = (url: string) => {
    singlesOnly.delete(url);
    singlesOnly.set(url, true);
    if (singlesOnly.size > 256)
      singlesOnly.delete(singlesOnly.keys().next().value!);
  };
  const wire = async (
    request: AvifRangeTransportRequest,
    ranges: readonly AvifRange[],
    signal: AbortSignal,
    delivered: Set<string>
  ) => {
    signal.throwIfAborted();
    if (ranges.length > 1 && singlesOnly.has(request.url))
      throw new UnsupportedMultiRange("Multi-range previously unsupported");
    request.onRequest?.(ranges);
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetchRange(request.url, {
        headers: {
          Range: `bytes=${ranges
            .map((part) => `${part.offset}-${endOf(part) - 1}`)
            .join(",")}`,
        },
        signal,
        priority: request.priority ?? "high",
        cache: request.cache ?? "default",
      });
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (ranges.length > 1 && error instanceof TypeError)
        throw new UnsupportedMultiRange("Multi-range network/CORS failure");
      throw error;
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => {
      void reader?.cancel().catch(() => undefined);
    };
    try {
      signal.throwIfAborted();
      if (response.status !== 206) {
        if (
          ranges.length > 1 &&
          [200, 400, 405, 416, 501].includes(response.status)
        )
          throw new UnsupportedMultiRange(
            `Multi-range answered ${response.status}`
          );
        throw new AvifHttpError(response.status, request.url);
      }
      request.onResponse?.(response);
      const kind = response.headers.get("Content-Type") ?? "";
      const multipart = /^multipart\/byteranges\b/i.test(kind);
      let boundary: string | undefined;
      if (multipart) {
        boundary = /(?:^|;)\s*boundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i
          .exec(kind)
          ?.slice(1)
          .find(Boolean);
        if (!boundary || boundary.length > 200 || /[^\x20-\x7e]/.test(boundary))
          throw new Error("Invalid multipart boundary");
      }
      let single: ReturnType<typeof contentRange> | undefined;
      if (!multipart) {
        const header = response.headers.get("Content-Range");
        if (!header && ranges.length > 1)
          throw new UnsupportedMultiRange("Ambiguous single-part 206");
        single = header
          ? contentRange(header)
          : { ...ranges[0], total: undefined };
      }
      const payloadLimit = ranges.length === 1 ? maxSingleBytes : maxBytes;
      const limit =
        payloadLimit + (multipart ? (maxParts + 1) * HEADER_LIMIT : 0);
      const length = response.headers.get("Content-Length");
      if (length && (!/^\d+$/.test(length) || Number(length) > limit))
        throw new Error("Range response exceeds byte limit");
      const hasRange = response.headers.has("Content-Range");
      if (!multipart && hasRange && length && Number(length) !== single!.length)
        throw new Error("Content-Length mismatch");
      // CORS may hide Content-Range. A visible exact Content-Length is enough
      // for a non-short, single requested interval, never for ambiguous multi.
      const progressiveSingle =
        !multipart &&
        ranges.length === 1 &&
        (hasRange ||
          (!request.allowShort &&
            length !== null &&
            Number(length) === ranges[0].length));
      if (!response.body) throw new Error("Missing range response body");
      reader = response.body.getReader();
      signal.addEventListener("abort", cancelReader, { once: true });
      signal.throwIfAborted();
      const stream = new BoundedReader(reader, limit, signal);
      let total: number | undefined;
      let payloadBytes = 0;
      const received: AvifRange[] = [];
      const consume = async (
        part: ReturnType<typeof contentRange>,
        supplied?: Uint8Array
      ) => {
        if (
          part.total !== undefined &&
          total !== undefined &&
          total !== part.total
        )
          throw new Error("Inconsistent range resource length");
        total ??= part.total;
        if (
          part.length > payloadLimit ||
          (payloadBytes += part.length) > payloadLimit
        )
          throw new Error("Range payload exceeds byte limit");
        if (
          received.some(
            (old) => part.offset < endOf(old) && old.offset < endOf(part)
          )
        )
          throw new Error("Overlapping response parts");
        const short =
          !multipart &&
          request.allowShort &&
          ranges.length === 1 &&
          part.offset === ranges[0].offset &&
          part.length < ranges[0].length &&
          (part.total === endOf(part) || supplied !== undefined);
        const covered = short
          ? [ranges[0]]
          : ranges.filter(
              (wanted) =>
                wanted.offset >= part.offset && endOf(wanted) <= endOf(part)
            );
        // Coalescing is legal, but may not extend beyond the requested outer
        // endpoints or split any requested interval into ambiguous fragments.
        if (
          !short &&
          (!covered.length ||
            Math.min(...covered.map((p) => p.offset)) !== part.offset ||
            Math.max(...covered.map(endOf)) !== endOf(part) ||
            ranges.some(
              (wanted) =>
                wanted.offset < endOf(part) &&
                part.offset < endOf(wanted) &&
                !covered.includes(wanted)
            ))
        )
          throw new Error("Unrequested or partial Content-Range");
        received.push(part);
        const bytes =
          supplied ??
          (await stream.exact(
            part.length,
            progressiveSingle && request.onProgress
              ? (offset, bytes) => {
                  signal.throwIfAborted();
                  request.onProgress!(
                    { offset: part.offset + offset, length: bytes.length },
                    bytes
                  );
                }
              : undefined
          ));
        signal.throwIfAborted();
        return () => {
          signal.throwIfAborted();
          for (const wanted of covered) {
            const key = `${wanted.offset}:${wanted.length}`;
            if (delivered.has(key)) throw new Error("Duplicate range response");
            const owned =
              covered.length === 1 && wanted.length === bytes.length
                ? bytes
                : bytes.slice(
                    wanted.offset - part.offset,
                    endOf(wanted) - part.offset
                  );
            request.onPart(
              short ? { offset: part.offset, length: bytes.length } : wanted,
              owned
            );
            delivered.add(key);
          }
        };
      };
      if (multipart) {
        // MIME permits a preamble (nginx starts with CRLF). Consume only a
        // bounded prefix; an arbitrary response must not turn into a full read.
        let preambleBytes = 0;
        while (true) {
          const line = await stream.line();
          if (line === `--${boundary}`) break;
          preambleBytes += new TextEncoder().encode(line).byteLength + 2;
          if (preambleBytes > HEADER_LIMIT)
            throw new Error("Multipart preamble exceeds limit");
        }
        let count = 0;
        while (true) {
          if (++count > maxParts) throw new Error("Too many multipart parts");
          let headerBytes = 0;
          let rangeHeader: string | null = null;
          while (true) {
            const line = await stream.line();
            headerBytes += line.length + 2;
            if (headerBytes > HEADER_LIMIT)
              throw new Error("Multipart headers exceed limit");
            if (!line) break;
            const colon = line.indexOf(":");
            if (colon < 1) throw new Error("Invalid multipart header");
            if (line.slice(0, colon).toLowerCase() === "content-range") {
              if (rangeHeader !== null)
                throw new Error("Duplicate Content-Range");
              rangeHeader = line.slice(colon + 1).trim();
            }
          }
          const publish = await consume(contentRange(rangeHeader));
          if ((await stream.line()) !== "")
            throw new Error("Invalid multipart payload delimiter");
          const delimiter = await stream.line(true);
          if (delimiter !== `--${boundary}--` && delimiter !== `--${boundary}`)
            throw new Error("Invalid multipart boundary");
          publish();
          if (delimiter === `--${boundary}--`) break;
        }
        await stream.end();
        if (length && Number(length) !== stream.receivedBytes)
          throw new Error("Content-Length mismatch");
      } else {
        let supplied: Uint8Array | undefined;
        if (!hasRange && !progressiveSingle) {
          supplied = await stream.upTo(ranges[0].length);
          if (
            !supplied.length ||
            (!request.allowShort && supplied.length !== ranges[0].length)
          )
            throw new Error("Range response length mismatch");
          single = {
            offset: ranges[0].offset,
            length: supplied.length,
            total: undefined,
          };
        }
        const publish = await consume(single!, supplied);
        await stream.exactEnd();
        if (length && Number(length) !== single!.length)
          throw new Error("Content-Length mismatch");
        publish();
      }
      if (
        ranges.some((part) => !delivered.has(`${part.offset}:${part.length}`))
      ) {
        if (!multipart && ranges.length > 1)
          throw new UnsupportedMultiRange(
            "Server returned only one requested part"
          );
        throw new Error("Incomplete multipart response");
      }
    } finally {
      signal.removeEventListener("abort", cancelReader);
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      } else await response.body?.cancel().catch(() => undefined);
    }
  };
  return {
    /** Stop once the native front metadata and base layer are independently usable. */
    async streamPrefix(request: AvifPrefixTransportRequest): Promise<void> {
      if (
        !Number.isSafeInteger(request.maxBytes) ||
        request.maxBytes < 1 ||
        request.maxBytes > DEFAULT_BYTES ||
        (request.rangeBytes !== undefined &&
          (!Number.isSafeInteger(request.rangeBytes) ||
            request.rangeBytes < 1 ||
            request.rangeBytes > DEFAULT_BYTES))
      )
        throw new RangeError("Invalid AVIF prefix byte limit");
      const signal = AbortSignal.any([request.signal, controller.signal]);
      let received = 0;
      let resourceBytes: number | undefined;
      let ordinaryFallback = false;
      while (received < request.maxBytes) {
        const offset = received;
        const length = Math.min(
          request.rangeBytes ?? request.maxBytes,
          request.maxBytes - offset
        );
        const ranged = request.rangeBytes !== undefined && !ordinaryFallback;
        let complete = false;
        await schedule(signal, request.priority ?? "high", async () => {
          signal.throwIfAborted();
          request.onRequest?.();
          signal.throwIfAborted();
          const response = await fetchRange(request.url, {
            signal,
            priority: request.priority ?? "high",
            cache: "no-cache",
            ...(!ranged
              ? {}
              : {
                  headers: { Range: `bytes=${offset}-${offset + length - 1}` },
                }),
          });
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          const cancel = () => {
            void reader?.cancel().catch(() => undefined);
          };
          try {
            signal.throwIfAborted();
            const partial = ranged && response.status === 206;
            if (!partial && (response.status !== 200 || offset !== 0))
              throw new AvifHttpError(
                response.status,
                request.url,
                ranged ? 206 : 200
              );
            request.onResponse?.(response);
            let part: ReturnType<typeof contentRange> | undefined;
            if (partial) {
              if (
                /^multipart\/byteranges\b/i.test(
                  response.headers.get("Content-Type") ?? ""
                )
              )
                throw new Error("Multipart native AVIF prefix response");
              const header = response.headers.get("Content-Range");
              const declared = response.headers.get("Content-Length");
              if (header === null) {
                // Match the existing single-range CORS contract: only an exact,
                // visible Content-Length makes the requested window unambiguous.
                if (
                  declared !== null &&
                  /^\d+$/.test(declared) &&
                  Number(declared) === length
                )
                  part = { offset, length, total: undefined };
                else if (offset === 0 && !ordinaryFallback) {
                  // No bytes have been published. Retry this same asset once as
                  // the existing early-cancel stream, never as another format.
                  ordinaryFallback = true;
                  return;
                } else
                  throw new Error("Ambiguous native AVIF prefix Content-Range");
              } else part = contentRange(header);
              if (
                part.offset !== offset ||
                part.length > length ||
                (part.length < length && part.total !== endOf(part))
              )
                throw new Error("Unexpected native AVIF prefix Content-Range");
              if (
                declared !== null &&
                (!/^\d+$/.test(declared) || Number(declared) !== part.length)
              )
                throw new Error("Native AVIF prefix Content-Length mismatch");
              if (
                resourceBytes !== undefined &&
                part.total !== undefined &&
                resourceBytes !== part.total
              )
                throw new Error("Native AVIF prefix resource length changed");
              resourceBytes ??= part.total;
            }
            if (!response.body)
              throw Error("Missing AVIF prefix response body");
            reader = response.body.getReader();
            signal.addEventListener("abort", cancel, { once: true });
            let responseBytes = 0;
            for (;;) {
              signal.throwIfAborted();
              const chunk = await reader.read();
              signal.throwIfAborted();
              if (chunk.done) {
                if (
                  !part ||
                  responseBytes !== part.length ||
                  endOf(part) === part.total
                )
                  throw Error("Incomplete native AVIF bootstrap");
                return;
              }
              responseBytes += chunk.value.length;
              received += chunk.value.length;
              request.onBytes?.(received);
              if (received > request.maxBytes)
                throw new RangeError("AVIF prefix exceeds byte limit");
              if (part && responseBytes > part.length)
                throw new Error(
                  "Native AVIF prefix response exceeds Content-Range"
                );
              if (request.onChunk(chunk.value)) {
                complete = true;
                return;
              }
            }
          } finally {
            signal.removeEventListener("abort", cancel);
            if (reader) {
              await reader.cancel().catch(() => undefined);
              reader.releaseLock();
            } else await response.body?.cancel().catch(() => undefined);
          }
        });
        if (complete) return;
      }
      throw new RangeError("AVIF prefix exceeds byte limit");
    },
    async read(request: AvifRangeTransportRequest): Promise<void> {
      const own = new AbortController();
      const cancel = () => own.abort();
      request.signal.addEventListener("abort", cancel, { once: true });
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (request.signal.aborted || controller.signal.aborted) own.abort();
      const priority = request.priority ?? "high";
      try {
        own.signal.throwIfAborted();
        const groups = planAvifRangeRequests(request.ranges, {
          maxBytes,
          maxParts,
          maxSingleBytes,
        });
        if (
          request.allowShort &&
          (request.ranges.length !== 1 || groups.length !== 1)
        )
          throw new RangeError("Short discovery must be one bounded range");
        await Promise.all(
          groups.map(async (group) => {
            const delivered = new Set<string>();
            const single = () =>
              Promise.all(
                group
                  .filter(
                    (part) => !delivered.has(`${part.offset}:${part.length}`)
                  )
                  .map((part) =>
                    schedule(own.signal, priority, () =>
                      wire(request, [part], own.signal, delivered)
                    )
                  )
              ).then(() => undefined);
            if (
              request.preferSingle ||
              singlesOnly.has(request.url) ||
              group.length === 1
            ) {
              await single();
              return;
            }
            try {
              await schedule(own.signal, priority, () =>
                wire(request, group, own.signal, delivered)
              );
            } catch (error) {
              if (
                own.signal.aborted ||
                !(error instanceof UnsupportedMultiRange)
              )
                throw error;
              disableMulti(request.url);
              await single();
            }
          })
        );
      } catch (error) {
        own.abort();
        throw error;
      } finally {
        request.signal.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", cancel);
      }
    },
    dispose() {
      controller.abort();
    },
  };
};

/** Shared admission for existing and native-spatial AVIF readers. */
export const sharedAvifRangeTransport = createAvifRangeTransport({
  concurrency: 3,
});
