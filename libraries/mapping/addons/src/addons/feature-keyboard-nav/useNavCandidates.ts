import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

import {
  buildCandidates,
  EMPTY_CANDIDATE_SET,
  type CandidateSet,
} from "./candidates";
import type { NavScope } from "./scope";
import { navScopeKey } from "./scope";

/**
 * The candidate set, rebuilt once per settled map movement and never per
 * keypress.
 *
 * `idle` rather than `moveend`: `moveend` fires before tile processing is
 * finished, which is when `queryRenderedFeatures` throws "feature index out of
 * bounds". A throw is not fatal here — the previous set stays in place and the
 * degraded flag goes up, so navigation keeps working on a set the user has been
 * told is incomplete instead of dying on a key.
 *
 * Consequences the addon documents to its users: the set describes data, not
 * pixels. An icon the renderer dropped for a label collision stays navigable,
 * and so does a polygon another layer covers completely; `verifyWithRenderer`
 * buys that back where it matters. Features hidden by zoom range or a style
 * filter are absent, which is intended — navigation follows what the style
 * draws.
 */

export type NavCandidateState = {
  candidateSet: CandidateSet;
  /** bumped on every settled query, so a pan can be waited out */
  version: number;
};

export const useNavCandidates = ({
  map,
  scope,
  enabled,
  maxCandidates,
  debounceMs,
}: {
  map: MaplibreMap | null;
  scope: NavScope;
  enabled: boolean;
  maxCandidates: number;
  debounceMs: number;
}): NavCandidateState => {
  const [state, setState] = useState<NavCandidateState>({
    candidateSet: EMPTY_CANDIDATE_SET,
    version: 0,
  });

  // scopes are rebuilt every render; the key is what actually changed
  const scopeKey = navScopeKey(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const maxCandidatesRef = useRef(maxCandidates);
  maxCandidatesRef.current = maxCandidates;

  const query = useCallback((mapInstance: MaplibreMap) => {
    const { styleLayerIds, catalogLayerIds, requireCatalogLayer } =
      scopeRef.current;

    // a scoped navigation whose layers are not in the style right now has an
    // empty set, which is different from an unscoped query of everything
    let layers: string[] | undefined;
    if (styleLayerIds) {
      layers = styleLayerIds.filter((id) => {
        try {
          return Boolean(mapInstance.getLayer(id));
        } catch {
          return false;
        }
      });
      if (layers.length === 0) {
        setState((previous) => ({
          candidateSet: EMPTY_CANDIDATE_SET,
          version: previous.version + 1,
        }));
        return;
      }
    }

    let features: MapGeoJSONFeature[];
    try {
      features = mapInstance.queryRenderedFeatures(
        layers ? { layers } : undefined
      );
    } catch (error) {
      console.warn(
        "[FEATURE_KEYBOARD_NAV] candidate query failed, keeping the previous set",
        error
      );
      setState((previous) => ({
        candidateSet: { ...previous.candidateSet, degraded: true },
        version: previous.version + 1,
      }));
      return;
    }

    const candidateSet = buildCandidates(features, {
      catalogLayerIds,
      requireCatalogLayer,
      maxCandidates: maxCandidatesRef.current,
    });
    setState((previous) => ({
      candidateSet,
      version: previous.version + 1,
    }));
  }, []);

  useEffect(() => {
    if (!map || !enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        query(map);
      }, debounceMs);
    };

    schedule();
    map.on("idle", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("idle", schedule);
    };
    // `scopeKey` stands for the scope object, which is rebuilt per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, debounceMs, scopeKey, query]);

  // leaving the mode drops the set, so re-entering never navigates on a
  // viewport the user has since moved away from
  useEffect(() => {
    if (enabled) return;
    setState((previous) =>
      previous.candidateSet === EMPTY_CANDIDATE_SET && previous.version === 0
        ? previous
        : { candidateSet: EMPTY_CANDIDATE_SET, version: 0 }
    );
  }, [enabled]);

  return state;
};
