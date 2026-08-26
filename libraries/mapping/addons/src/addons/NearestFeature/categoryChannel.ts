import { useEffect, useRef } from "react";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { useAddonState } from "../../lib/AddonStateContext";

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
  key: string;
  /** what the first stage lists, and the prefix the input then carries */
  label: string;
  /** shown on the category's rows instead of the mode's own icon */
  icon?: IconDefinition;
  /** catalog layer id, as `carma.mapping2D.addLayer` speaks it */
  layerId: string;
  /** one source-layer of that tileset; default: every one the style draws */
  sourceLayer?: string;
  featureIndexUrl?: string;
  /** properties tried in order for a row's title; first non-empty wins */
  labelProperties?: string[];
  /** properties tried in order for the smaller second line */
  detailProperties?: string[];
};

/** key -> category, in the order the producers mounted */
export type NearestFeatureCategoryState = Record<
  string,
  NearestFeatureCategory
>;

/**
 * What a category addon lets its route override of its own definition: all of
 * it but the key, which is the addon's identity in the channel.
 */
export type NearestFeatureCategoryConfig = Partial<
  Omit<NearestFeatureCategory, "key">
>;

/**
 * Publish one category for as long as the calling addon is mounted.
 *
 * The effect depends on a signature rather than on the object, which is new on
 * every render; the current definition is read from a ref, so a changed icon or
 * property list republishes without the effect running on every render.
 */
export const useNearestFeatureCategory = (category: NearestFeatureCategory) => {
  const [, publish] = useAddonState("nearestFeatureCategories");
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const { key } = category;
  const signature = `${JSON.stringify({
    ...category,
    icon: undefined,
  })}|${category.icon?.iconName ?? ""}`;

  useEffect(() => {
    publish((previous) => ({ ...previous, [key]: categoryRef.current }));
    return () => {
      publish((previous) => {
        if (!previous || !(key in previous)) {
          return previous ?? {};
        }
        const next = { ...previous };
        delete next[key];
        return next;
      });
    };
  }, [publish, key, signature]);
};
