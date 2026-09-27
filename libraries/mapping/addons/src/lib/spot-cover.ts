/**
 * One darkness per map.
 *
 * Two things darken the map around bright spots: the Schwebebahn's cab light,
 * a layer inside the map (`vehicle-spotlight.ts`), and the outlet's stored
 * highlights, a canvas over the window (`outlet/HighlightSpots.tsx`). Stacked,
 * they darkened the map twice, and each covered the other's spots. So the cab
 * light says here where its spots are and how dark it wants the map, and while
 * the highlights are on, their canvas cuts those spots out as well, darkens
 * with the stronger of the two, and the cab light steps back by as much as the
 * canvas has faded in (`takeover`, 0 to 1).
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
  takeover: number;
};

const covers = new WeakMap<object, MapCover>();

const coverOf = (map: object): MapCover => {
  let cover = covers.get(map);
  if (!cover) {
    cover = { sources: new Map(), takeover: 0 };
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

/** how far the canvas over the map has taken the darkening over, 0..1 */
export const setCoverTakeover = (map: object, share: number): void => {
  coverOf(map).takeover = Math.max(0, Math.min(1, share));
};

export const coverTakeoverOf = (map: object): number =>
  covers.get(map)?.takeover ?? 0;
