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

/**
 * What the candidate set depends on, as a string.
 *
 * `idle` is a firehose: it fires after tile loads, after fades, and after every
 * `keepInView` pan, so a held arrow key would otherwise re-query the whole
 * viewport between steps, and on a dense ALKIS view one query walks thousands
 * of rendered features. The centre is rounded to about a metre, which is finer
 * than any move a user can make without changing what is on screen.
 */
const viewSignature = (map: MaplibreMap, scopeKey: string): string => {
  const { lng, lat } = map.getCenter();
  return [
    scopeKey,
    lng.toFixed(5),
    lat.toFixed(5),
    map.getZoom().toFixed(3),
    map.getBearing().toFixed(1),
    map.getPitch().toFixed(1),
    // a view that has not moved still gains features while its tiles arrive,
    // so the last idle of a load is a different signature from the ones before
    map.areTilesLoaded() ? "loaded" : "loading",
  ].join("|");
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
  /** the view the current set was built for; `undefined` forces a rebuild */
  const signatureRef = useRef<string | undefined>(undefined);

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

    const signature = viewSignature(mapInstance, navScopeKey(scopeRef.current));
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

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
      // a failed query says nothing about the view, so the next idle retries
      signatureRef.current = undefined;
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
    // the set is dropped, so the next activation has to query again even if the
    // map never moved in between
    signatureRef.current = undefined;
    setState((previous) =>
      previous.candidateSet === EMPTY_CANDIDATE_SET && previous.version === 0
        ? previous
        : { candidateSet: EMPTY_CANDIDATE_SET, version: 0 }
    );
  }, [enabled]);

  return state;
};
