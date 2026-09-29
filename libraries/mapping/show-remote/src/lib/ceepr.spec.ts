import { ShowStoreError, fetchShow, publishShow, republishShow } from "./ceepr";
import { isPackedShow, packShow, unpackStored } from "./packed-show";
import { SHOW_FORMAT, SHOW_VERSION, type Show } from "./show";

const show: Show = {
  format: SHOW_FORMAT,
  version: SHOW_VERSION,
  title: "Show",
  publishedAt: "2026-09-29T00:00:00.000Z",
  scenes: [
    { id: "s1", title: "Szene 1", config: { layers: [] } },
  ] as Show["scenes"],
};

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** a fetch stand-in that records what it was called with */
const fetchAnswering = (status: number, body: unknown) =>
  vi.fn<[string, RequestInit?], Promise<ReturnType<typeof answer>>>(async () =>
    answer(status, body)
  );

const sentBody = (fetchMock: ReturnType<typeof fetchAnswering>): unknown =>
  JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishShow / republishShow", () => {
  it("posts the show packed", async () => {
    const fetchMock = fetchAnswering(200, { key: "k1" });
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await publishShow("https://store.example.org/shows", show, "t")
    ).toBe("k1");
    const body = sentBody(fetchMock);
    expect(isPackedShow(body)).toBe(true);
    expect(await unpackStored(body)).toEqual(show);
  });

  it("puts the show packed under its key", async () => {
    const fetchMock = fetchAnswering(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await republishShow("https://store.example.org/shows/", "k1", show, "t");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://store.example.org/shows/k1"
    );
    expect(await unpackStored(sentBody(fetchMock))).toEqual(show);
  });
});

describe("fetchShow", () => {
  it("reads a packed show", async () => {
    const packed = await packShow(show);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(200, packed))
    );
    expect(await fetchShow("https://store.example.org/config", "k1")).toEqual(
      show
    );
  });

  it("reads a plain show stored before packing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(200, show))
    );
    expect(await fetchShow("https://store.example.org/config", "k1")).toEqual(
      show
    );
  });

  it("rejects a packed document that holds no show", async () => {
    const packed = await packShow({ nope: true } as unknown as Show);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(200, packed))
    );
    await expect(
      fetchShow("https://store.example.org/config", "k1")
    ).rejects.toBeInstanceOf(ShowStoreError);
  });
});
