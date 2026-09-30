import type { BackgroundLayer } from "@carma-mapping/layers";

import type { BackgroundConfig } from "../config/geoportalBackground";

/** the part of the stored mapping slice that names base maps */
type StoredBackground = {
  selectedByCategory?: Record<string, BackgroundLayer | undefined>;
  backgroundLayer?: BackgroundLayer;
};

/**
 * The stored slice without its base map choice, for a route that does not
 * remember one (`disableBackgroundPersistence`): the store's initial state
 * stands, and the next write leaves the old entries out of the record.
 */
export const withoutStoredBackground = <T extends object>(state: T): T => {
  const rest: StoredBackground = { ...state };
  delete rest.selectedByCategory;
  delete rest.backgroundLayer;
  return rest as T;
};

/** `toBackgroundLayer` of `config/backgroundConfig` */
type BuildBackgroundLayer = (
  id: string,
  state: { opacity?: number; visible?: boolean }
) => BackgroundLayer;

/**
 * The stored base map choice checked against the route's background, as the
 * store reads it back. A stored entry the route no longer offers becomes its
 * category's default, a stored category the route does not have becomes the
 * route's default category. Every entry is built anew from the config, so its
 * title, texts and services are the current ones; opacity and visibility stay
 * as they were stored.
 *
 * Without this, a route that changed its base maps (the outlet's black and
 * white) would keep drawing what an earlier visit stored.
 */
export const withKnownBackground = <T extends object>(
  state: T,
  config: Pick<BackgroundConfig, "categories" | "defaultCategory">,
  build: BuildBackgroundLayer
): T => {
  const { selectedByCategory: stored, backgroundLayer: background } =
    state as StoredBackground;
  if (!stored && !background) {
    return state;
  }
  const selectedByCategory: Record<string, BackgroundLayer> =
    Object.fromEntries(
      config.categories.map((category) => {
        const entry = stored?.[category.id];
        const id =
          entry && category.entries.includes(entry.id)
            ? entry.id
            : category.defaultEntry ?? category.entries[0];
        return [
          category.id,
          build(id, { opacity: entry?.opacity, visible: entry?.visible }),
        ];
      })
    );

  const categoryId =
    background && background.id in selectedByCategory
      ? background.id
      : config.defaultCategory;
  const selected = selectedByCategory[categoryId];
  if (!selected) {
    return state;
  }
  const checked: StoredBackground = {
    selectedByCategory,
    backgroundLayer: {
      ...selected,
      id: categoryId,
      opacity: background?.opacity ?? selected.opacity,
      visible: background?.visible ?? selected.visible,
    },
  };
  return { ...state, ...checked };
};
