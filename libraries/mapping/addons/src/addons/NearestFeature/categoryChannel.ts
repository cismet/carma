import { useEffect, useRef } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { useAddonState } from "../../lib/AddonStateContext";
import type { FeaturePredicate } from "../../lib/featureIndex";

/**
 * The `nearestFeatureCategories` channel: what the mode's first stage offers.
 *
 * A category is not configured on the mode, it is an addon of its own that
 * publishes itself here. A route therefore mixes and matches categories by
 * declaring them ("Apotheken" plus whatever else), and the addon manager can
 * switch one off without touching the mode.
 *
 * The channel is a record rather than a list, keyed per category, so several
 * producers can write it side by side: each one merges its own entry in and
 * takes it out again when it unmounts, and nobody overwrites a sibling.
 */

export type NearestFeatureCategory = {
  /** identity in the channel, and what a later publish of the same one replaces */
  id: string;
  /** what the first stage lists, and the prefix the input then carries */
  label: string;
  /** shown on the category's rows instead of the mode's own icon */
  icon?: IconDefinition;
  /** catalog layer id, as `carma.mapping2D.addLayer` speaks it */
  layerId: string;
  /** one source-layer of that tileset; default: every one the style draws */
  sourceLayer?: string;
  featureIndexUrl?: string;
  /**
   * Which features of the layer count at all, decided per feature from the
   * property columns its `features.json` carries (the pipeline writes them for
   * a layer with `FEATURE_INDEX_PROPERTIES`). "Apotheken mit Notdienst" is
   * "Apotheken" with `({ heute }) => heute === true`. Without it every feature
   * of the layer takes part.
   */
  where?: FeaturePredicate;
  /** properties tried in order for a row's title; first non-empty wins */
  labelProperties?: string[];
  /** properties tried in order for the smaller second line */
  detailProperties?: string[];
};

/** id -> category, in the order the producers mounted */
export type NearestFeatureCategoryState = Record<
  string,
  NearestFeatureCategory
>;

/**
 * What a category addon lets its route override of its own definition: all of
 * it. A route that wants a variant of a category ("Apotheken mit Notdienst"
 * next to "Apotheken") declares the same addon twice with another `id`,
 * `label` and `where`; the id is what keeps the two apart in the channel, so
 * a second instance without one replaces the first.
 */
export type NearestFeatureCategoryConfig = Partial<NearestFeatureCategory>;

/**
 * Publish one category for as long as the calling addon is mounted.
 *
 * The effect depends on a signature rather than on the object, which is new on
 * every render; the current definition is read from a ref, so a changed icon or
 * property list republishes without the effect running on every render. The
 * `where` predicate is a function and so not in the signature: it is part of a
 * category's definition and not expected to change while the addon is mounted.
 */
export const useNearestFeatureCategory = (category: NearestFeatureCategory) => {
  const [, publish] = useAddonState("nearestFeatureCategories");
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const { id } = category;
  const signature = `${JSON.stringify({
    ...category,
    icon: undefined,
  })}|${category.icon?.iconName ?? ""}`;

  useEffect(() => {
    publish((previous) => ({ ...previous, [id]: categoryRef.current }));
    return () => {
      publish((previous) => {
        if (!previous || !(id in previous)) {
          return previous ?? {};
        }
        const next = { ...previous };
        delete next[id];
        return next;
      });
    };
  }, [publish, id, signature]);
};
