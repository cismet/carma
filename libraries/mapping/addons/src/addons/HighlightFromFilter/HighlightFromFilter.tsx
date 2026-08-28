import { useEffect, useMemo } from "react";

import { useLibreContext } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";

/** matches `vectorHighlight`, so both ways of dimming look the same */
const DEFAULT_DIM_OPACITY = 0.25;

export type HighlightFromFilterConfig = {
  /**
   * Restrict the addon to these layer ids. Left out, it covers every layer that
   * carries a filter, which is what the map already knows; the addon does not
   * need to enumerate them itself.
   */
  layerIds?: string[];
  /** opacity factor for the features that do not match. Default: 0.25 */
  dimOpacity?: number;
};

/**
 * Turns the style filter into a highlight: the same buttons, the same selection,
 * but the features that do not match are dimmed instead of removed, so the ones
 * that do match stand out without losing their surroundings.
 *
 * The addon owns no layers and touches no app. It sets the map's filter
 * presentation on `LibreContext`, and the style builder, which already bakes
 * each layer's filter into the composed style, reads that and bakes a dim
 * instead. A host app keeps handing its layers a plain filter expression and
 * needs to know nothing about this addon: mounting it anywhere above the map is
 * the whole integration.
 *
 * Baking rather than writing paint properties at runtime is deliberate: the
 * merged style is rebuilt and diffed on every change, so a runtime write would
 * be overwritten by the next rebuild and would fight the opacity slider, whose
 * value is baked into the very same paint properties.
 */
export const HighlightFromFilter = ({
  config,
}: AddonComponentProps<"highlightFromFilter">) => {
  const { layerIds, dimOpacity = DEFAULT_DIM_OPACITY } = config ?? {};
  const { setFilterPresentation } = useLibreContext();

  // key on the content: route configs pass a fresh array per render
  const idKey = layerIds ? JSON.stringify(layerIds) : null;
  const ids = useMemo(
    () => (idKey === null ? null : (JSON.parse(idKey) as string[])),
    [idKey]
  );

  useEffect(() => {
    setFilterPresentation({ layerIds: ids, dimOpacity });
    // back to plain filtering when the addon is switched off or the route leaves
    return () => setFilterPresentation(null);
  }, [setFilterPresentation, ids, dimOpacity]);

  return null;
};
