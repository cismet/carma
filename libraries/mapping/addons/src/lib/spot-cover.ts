/**
 * One darkness per map.
 *
 * Things darken the map around bright spots: the Schwebebahn's cab light, a
 * layer inside the map (`vehicle-spotlight.ts`), and the outlet's canvases
 * over the window, the stored highlights (`outlet/HighlightSpots.tsx`) and the
 * phone's pointer (`outlet/PointerSpotlight.tsx`). Stacked, they darkened the
 * map twice, and each covered the other's spots. So the cab light says here
 * where its spots are and how dark it wants the map, and while a canvas is on,
 * it cuts those spots out as well, darkens with the stronger of the two, and
 * the cab light steps back by as much as the canvas has faded in (`takeover`,
 * 0 to 1). While one canvas fades out and the other in, the one further in
 * counts.
 *
 * Kept per map, so two maps on one page do not see each other's spots.
 */

/** where one source leaves the map bright, and how dark it wants the rest */
export type CoverSource = {
  /** 0..1, already faded with the source's own opacity */
  dim: number;
  radiusMeters: number;
  /** the soft edge as a share of the radius on either side of it */
  softness: number;
  centres: readonly { lon: number; lat: number }[];
};

type MapCover = {
  sources: Map<object, CoverSource>;
  /** each canvas's share, by the object it writes under */
  takeovers: Map<object, number>;
};

const covers = new WeakMap<object, MapCover>();

const coverOf = (map: object): MapCover => {
  let cover = covers.get(map);
  if (!cover) {
    cover = { sources: new Map(), takeovers: new Map() };
    covers.set(map, cover);
  }
  return cover;
};

/** `source` is any object the caller keeps for as long as it publishes */
export const publishCoverSource = (
  map: object,
  source: object,
  cover: CoverSource
): void => {
  coverOf(map).sources.set(source, cover);
};

export const withdrawCoverSource = (map: object, source: object): void => {
  covers.get(map)?.sources.delete(source);
};

/** the sources that darken the map right now */
export const coverSourcesOf = (map: object): CoverSource[] => [
  ...(covers.get(map)?.sources.values() ?? []),
].filter(({ dim }) => dim > 0);

/**
 * How far `writer`'s canvas over the map has taken the darkening over, 0..1.
 * `writer` is any object the canvas keeps; 0 takes its share away.
 */
export const setCoverTakeover = (
  map: object,
  writer: object,
  share: number
): void => {
  const clamped = Math.max(0, Math.min(1, share));
  const { takeovers } = coverOf(map);
  if (clamped > 0) {
    takeovers.set(writer, clamped);
  } else {
    takeovers.delete(writer);
  }
};

/** the largest share any canvas has taken over */
export const coverTakeoverOf = (map: object): number =>
  Math.max(0, ...(covers.get(map)?.takeovers.values() ?? []));
