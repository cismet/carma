/** Runtime contract for the reproducible Blender collection manifest. */
export type DzbPrmPartId =
  | "environment"
  | "zoo"
  | "bridge"
  | "bridge-existing"
  | "station";

export type DzbPrmQuality = "2m" | "5m" | "original";

export type DzbPrmModelCollection = Readonly<{
  schemaVersion: 1;
  id: "dz-b-prm";
  title: string;
  anchor3857: readonly [number, number];
  boardBounds3857: readonly [number, number, number, number];
  boardBottomHeightMeters: number;
  defaultQuality: DzbPrmQuality;
  qualities: Partial<
    Record<
      DzbPrmQuality,
      Record<DzbPrmPartId, Readonly<{ uri: string; glbSha256: string }>>
    >
  >;
}>;

export type DzbPrmModelState = Readonly<{
  visible: boolean;
  opacity: number;
  quality: DzbPrmQuality;
  bridge: "planning" | "existing" | "catalog";
}>;

export const createInitialDzbPrmModelState = (): DzbPrmModelState => ({
  visible: true,
  opacity: 0.25,
  quality: "5m",
  bridge: "planning",
});

export const selectedDzbPrmParts = (
  state: DzbPrmModelState
): readonly DzbPrmPartId[] =>
  state.visible
    ? [
        "environment",
        "zoo",
        "station",
        ...(state.bridge === "catalog"
          ? []
          : ([
              state.bridge === "planning" ? "bridge" : "bridge-existing",
            ] as const)),
      ]
    : [];

export const resolveDzbPrmPartUrls = (
  collection: DzbPrmModelCollection,
  manifestUrl: string,
  state: DzbPrmModelState
): ReadonlyArray<{ id: DzbPrmPartId; url: string }> => {
  const quality = collection.qualities[state.quality];
  if (!quality) return [];
  const base = new URL(".", new URL(manifestUrl, globalThis.location.href));
  return selectedDzbPrmParts(state).map((id) => ({
    id,
    url: new URL(quality[id].uri, base).href,
  }));
};

const manifestCache = new Map<string, Promise<DzbPrmModelCollection>>();

export const loadDzbPrmCollection = (
  manifestUrl: string
): Promise<DzbPrmModelCollection> => {
  const cached = manifestCache.get(manifestUrl);
  if (cached) return cached;
  const load = fetch(manifestUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Collection HTTP ${response.status}`);
      return response.json() as Promise<DzbPrmModelCollection>;
    })
    .then((collection) => {
      if (
        collection.schemaVersion !== 1 ||
        collection.id !== "dz-b-prm" ||
        !collection.qualities[collection.defaultQuality]
      ) {
        throw new Error("Invalid DZ_B_PRM collection manifest");
      }
      return collection;
    })
    .catch((error: unknown) => {
      manifestCache.delete(manifestUrl);
      throw error;
    });
  manifestCache.set(manifestUrl, load);
  return load;
};
