import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import type { Item } from "../lib/contracts/carma-layers.d";
import type { AdditionalLayerEntry } from "../config/layerCatalogConfig";
import {
  buildVectorStyleItem,
  isVectorStyleUrl,
  normalizeAdditionalLayers,
  type ConfiguredLayerGroup,
  type ConfiguredLayerRef,
} from "../helper/configuredLayers";

export const CONFIGURED_STYLE_QUERY_KEY = "configuredVectorStyle";
const CONFIGURED_STYLE_STALE_TIME = 1000 * 60 * 60;

const fetchVectorStyle = async (
  url: string,
  vectorTileServerUrl?: string
): Promise<unknown> => {
  const response = await fetch(url);
  const text = await response.text();
  const resolved = vectorTileServerUrl
    ? text
        .replaceAll("__SERVER_URL__", vectorTileServerUrl)
        .replaceAll("__server_url__", vectorTileServerUrl)
    : text;
  return JSON.parse(resolved);
};

/**
 * The layers a host declares in `additionalLayers`, as groups the catalog
 * derivation folds into its "Kartenebenen" subcategories.
 *
 * A style contributes its item only once its fetch has settled, since what the
 * style says about itself (`metadata.carmaConf.layerInfo`: title, description,
 * thumbnail, legend) is all the item has. An item published before that would
 * carry the url-derived placeholder title, and the active-layer sync would
 * write that placeholder onto a restored layer that already had the real name.
 * A style that cannot be read keeps the url-derived defaults, so an unreachable
 * style costs the name and not the layer. Catalog ids stay strings here, they
 * are resolved against the built catalog.
 */
export const useConfiguredLayers = (
  entries?: AdditionalLayerEntry[],
  vectorTileServerUrl?: string
): ConfiguredLayerGroup[] => {
  const refGroups = useMemo(
    () => normalizeAdditionalLayers(entries),
    [entries]
  );
  const styleUrls = useMemo(
    () =>
      Array.from(
        new Set(
          refGroups.flatMap((group) =>
            group.refs
              .map((entry) => entry.ref)
              .filter((ref) => isVectorStyleUrl(ref))
          )
        )
      ),
    [refGroups]
  );

  return useQueries({
    queries: styleUrls.map((url) => ({
      queryKey: [CONFIGURED_STYLE_QUERY_KEY, url],
      queryFn: () => fetchVectorStyle(url, vectorTileServerUrl),
      staleTime: CONFIGURED_STYLE_STALE_TIME,
      retry: false,
    })),
    // built here so react-query's structural sharing keeps the result stable
    // across renders; the catalog derivation depends on its identity
    combine: (results) => {
      const styles = new Map(
        styleUrls.map((url, index) => [
          url,
          results[index]?.status === "pending"
            ? undefined
            : { data: results[index]?.data },
        ])
      );
      return refGroups.map((group) => ({
        id: group.id,
        Title: group.Title,
        entries: group.refs.flatMap<Item | ConfiguredLayerRef>((entry) => {
          if (!isVectorStyleUrl(entry.ref)) {
            return [entry];
          }
          const style = styles.get(entry.ref);
          return style
            ? [
                buildVectorStyleItem(entry.ref, style.data, {
                  path: group.Title,
                  ...(entry.tools ? { tools: entry.tools } : {}),
                }),
              ]
            : [];
        }),
      }));
    },
  });
};
