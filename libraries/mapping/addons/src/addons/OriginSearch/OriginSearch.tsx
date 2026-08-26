import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

import {
  getFromUTM32ToWGS84,
  getFromWebMercatorToWGS84,
} from "@carma-geo/proj";
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
  DEFAULT_ORIGIN,
  DEFAULT_PIXELWIDTH,
  DEFAULT_PLACEHOLDER_PREFIX,
} from "./config";
import {
  useOriginLocation,
  useOriginLocationState,
  type OriginLocation,
} from "./originChannel";
import { addOriginMarker } from "./originMarker";

/**
 * The "von wo?" input: a second gazetteer search that says where the user
 * starts from, next to the app's own search, which says where to go.
 *
 * It is an ordinary address search, so any address, POI or place the gazetteer
 * knows can be the starting point. What it produces goes on the
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
    defaultOrigin = DEFAULT_ORIGIN,
    placeholderPrefix = DEFAULT_PLACEHOLDER_PREFIX,
    inputPrefix = DEFAULT_INPUT_PREFIX,
    pixelwidth = DEFAULT_PIXELWIDTH,
    alwaysVisible = false,
  } = config ?? {};

  const { origin, requests } = useOriginLocationState();
  const [, setOrigin] = useOriginLocation();

  // while the input is there it owns the origin, so a consumer reads one value
  // rather than falling back to a default of its own
  useEffect(() => {
    if (!origin) {
      setOrigin(defaultOrigin);
    }
  }, [origin, defaultOrigin, setOrigin]);

  const handleSelection = (hit: SearchResultItem | null) => {
    // the clear button: back to where the route says "nearby" starts
    setOrigin(hit ? toOrigin(hit) : defaultOrigin);
  };

  const visible = alwaysVisible || Object.keys(requests).length > 0;
  const { lat, lng, label } = origin ?? defaultOrigin;

  // the marker follows the origin for as long as the input is on screen: it is
  // this addon's own, so it is taken off the map again when nothing asks for a
  // starting point any more
  const markerRef = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!libreMap || !visible) {
      return;
    }
    markerRef.current = addOriginMarker(libreMap, { lat, lng, label });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [libreMap, visible, lat, lng, label]);

  if (!visible) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <div style={GAP_STYLE}>
        <LibFuzzySearch
          onSelection={handleSelection}
          inputPrefix={inputPrefix}
          placeholder={[placeholderPrefix, label].filter(Boolean).join(" ")}
          pixelwidth={pixelwidth}
          disableAdditionalModes={true}
        />
      </div>
    </Control>
  );
};

const GAP_STYLE = { marginTop: "8px" } as const;

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
