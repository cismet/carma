import { useEffect, useRef } from "react";
import { message } from "antd";
import type maplibregl from "maplibre-gl";

import {
  getFromUTM32ToWGS84,
  getFromWebMercatorToWGS84,
} from "@carma-geo/proj";
import { useLocate } from "@carma-mapping/contexts";
import {
  LibFuzzySearch,
  type SearchResultItem,
} from "@carma-mapping/fuzzy-search";
import { Control } from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import {
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  DEFAULT_INPUT_PREFIX,
  DEFAULT_PIXELWIDTH,
  DEFAULT_PLACEHOLDER_PREFIX,
  EXCLUDED_TYPES,
  LOCATING_PLACEHOLDER,
  NO_ORIGIN_PLACEHOLDER,
  NO_POSITION_PLACEHOLDER,
  NO_POSITION_WARNINGS,
  OWN_POSITION_LABEL,
} from "./config";
import {
  useOriginLocation,
  useOriginLocationState,
  useReportOriginResolution,
  type OriginLocation,
} from "./originChannel";
import { addOriginMarker } from "./originMarker";

/**
 * The "von wo?" input: a second gazetteer search that says where the user
 * starts from, next to the app's own search, which says where to go.
 *
 * It starts at the user's own position: the input asks the device for a fix
 * once, as soon as some consumer puts it on screen, and publishes it as "Mein
 * Standort". A route that measures from a fixed point instead configures
 * `defaultOrigin`, which skips the ask altogether. When the fix is declined or
 * unavailable nothing is published at all, so the input stands empty and the
 * user says where to start rather than being measured from a point they never
 * chose.
 *
 * It is an ordinary address search, so any address, POI or place the gazetteer
 * knows can be the starting point, minus the areas it knows (see
 * `EXCLUDED_TYPES`). What it produces goes on the
 * `originLocation` channel and nowhere else: "In der Nähe" ranks from it today,
 * a routing UI will draw its route from it, and neither knows about this
 * component.
 *
 * Two things keep it from getting in the way of the app's own search. It is on
 * screen only while some consumer asks for an origin (see `useOriginRequest`),
 * unless the route sets `alwaysVisible`; and it does not move the map, because
 * it passes its own `onSelection` instead of the app's, so picking a starting
 * point leaves the view where the destination search put it, and no gazetteer
 * selection marker is dropped. What the origin does get is a marker of its own
 * (see `originMarker.ts`), so the point everything measures from is visible.
 *
 * `disableAdditionalModes` keeps it a plain address search: without it the
 * input would offer the modes addons contributed, "In der Nähe" among them,
 * which is the very mode that reads what this one publishes.
 */
export const OriginSearch = ({
  config,
  libreMap,
}: AddonComponentProps<"originSearch">) => {
  const {
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    defaultOrigin,
    placeholderPrefix = DEFAULT_PLACEHOLDER_PREFIX,
    inputPrefix = DEFAULT_INPUT_PREFIX,
    pixelwidth = DEFAULT_PIXELWIDTH,
    alwaysVisible = false,
  } = config ?? {};

  const { origin, requests } = useOriginLocationState();
  const [, setOrigin] = useOriginLocation();

  const visible = alwaysVisible || Object.keys(requests).length > 0;

  const { currentPosition, problem, activate } = useLocate();
  const wantsOwnPosition = visible && !defaultOrigin;

  useEffect(() => {
    if (wantsOwnPosition) {
      activate({ fly: false });
    }
  }, [wantsOwnPosition, activate]);

  useReportOriginResolution(
    defaultOrigin || currentPosition || problem ? "settled" : "pending"
  );

  useEffect(() => {
    if (!problem) {
      return;
    }
    void message.warning(NO_POSITION_WARNINGS[problem]);
  }, [problem]);

  // where the input stands when nobody has typed anything into it: the point
  // the route named, or the user themselves. The location mode keeps watching,
  // so this is its latest fix; it is read at the moments below and not followed
  // tick by tick, which would re-rank "In der Nähe" and re-fit the map every few
  // meters the user walks.
  const defaultLocation = (): OriginLocation | null =>
    defaultOrigin ??
    (currentPosition
      ? {
          lat: currentPosition.coords.latitude,
          lng: currentPosition.coords.longitude,
          label: OWN_POSITION_LABEL,
        }
      : null);

  // while the input is there it owns the origin, so a consumer reads one value
  // rather than falling back to a default of its own. Without a fix and without
  // a configured starting point there is nothing honest to publish, so the
  // channel stays empty and the input asks the user where to start; this is
  // also what publishes the fix that arrives after the input is already up.
  useEffect(() => {
    if (origin || !visible) {
      return;
    }
    const location = defaultLocation();
    if (location) {
      setOrigin(location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, visible, defaultOrigin, currentPosition, setOrigin]);

  const handleSelection = (hit: SearchResultItem | null) => {
    // the clear button: back to where the route says "nearby" starts, which is
    // the user's own position unless the route named a point of its own. The
    // point itself, not an empty channel for the effect above to fill in a
    // render's time: a consumer reading the channel in between would see no
    // origin at all and measure from its own fallback, which is neither the
    // address that was cleared nor the position it is going back to.
    setOrigin(hit ? toOrigin(hit) : defaultLocation());
  };

  // the marker follows the origin for as long as the input is on screen: it is
  // this addon's own, so it is taken off the map again when nothing asks for a
  // starting point any more. Not while the origin is the user: the location
  // mode already draws them, and a second dot on the same spot is just a dot
  // with a shadow.
  const { lat, lng, label } = origin ?? {};
  const drawMarker = visible && label !== OWN_POSITION_LABEL;
  const markerRef = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!libreMap || !drawMarker || lat === undefined || lng === undefined) {
      return;
    }
    markerRef.current = addOriginMarker(libreMap, {
      lat,
      lng,
      label: label ?? "",
    });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [libreMap, drawMarker, lat, lng, label]);

  if (!visible) {
    return null;
  }

  // the current origin's name, or what is standing in for it while there is
  // none: the browser is still asking, or it has answered that it will not say
  const placeholder = label
    ? [placeholderPrefix, label].filter(Boolean).join(" ")
    : problem
    ? NO_POSITION_PLACEHOLDER
    : wantsOwnPosition
    ? LOCATING_PLACEHOLDER
    : NO_ORIGIN_PLACEHOLDER;

  return (
    <Control position={controlPosition} order={controlOrder}>
      <div style={WRAPPER_STYLE}>
        <LibFuzzySearch
          onSelection={handleSelection}
          inputPrefix={inputPrefix}
          placeholder={placeholder}
          pixelwidth={pixelwidth}
          excludeTypes={EXCLUDED_TYPES}
          disableAdditionalModes={true}
        />
      </div>
    </Control>
  );
};

/**
 * The gap that keeps the input off the app's own search, and the width that
 * makes it match that search: the bottom-left control column is as wide as its
 * widest child and aligns them to its right edge, so a fixed width would sit
 * indented under the search on a phone, where the search spans the screen.
 */
const WRAPPER_STYLE = { marginTop: "8px", width: "100%" } as const;

/**
 * A gazetteer hit as a starting point. The hit's coordinates are in the crs the
 * gaz source was configured with, which is web mercator for the default
 * sources and UTM32 for the ones that predate it.
 */
const toOrigin = (hit: SearchResultItem): OriginLocation => {
  const [lng, lat] =
    hit.crs === "25832"
      ? getFromUTM32ToWGS84([hit.x, hit.y])
      : getFromWebMercatorToWGS84([hit.x, hit.y]);
  return { lat, lng, label: hit.string };
};
