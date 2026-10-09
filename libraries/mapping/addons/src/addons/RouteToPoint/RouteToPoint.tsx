import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useLocate } from "@carma-mapping/contexts";
import { ROUTE_BLUE, fetchRoute, getModeIcon } from "@carma-mapping/routing";

import type { AddonComponentProps } from "../../lib/registry";
import { RoutePreview } from "../RoutePreview";
import {
  useActiveRoute,
  useReleaseActiveRoute,
  useRouteNavigation,
} from "../Routing/routeChannel";
import { travelModeOf } from "../Routing/routeMode";
import { useRouteMode, useRouteModeRequest } from "../Routing/routeModeChannel";
import { DEFAULT_LABEL, DEFAULT_LONG_PRESS_MS } from "./config";
import { onLongPress } from "./longPress";

/** what the route in focus says it came from */
const ROUTE_SOURCE = "routeToPoint";

type Status = { text: string; error?: boolean } | null;

/**
 * A route to any point on the map: a long press there (a right-click with a
 * mouse) opens a small popup with "Route hierher", and pressing it routes from
 * where the user is to that point by the mode on the `routeMode` channel.
 *
 * The route goes on `activeRoute` as one from the user's own position, so the
 * navigation can be started on it. There is no picked feature and so no info
 * box with the route button; the preview (`RoutePreview`) draws the line and
 * offers "Starten" itself, like the test routes.
 *
 * Where the user is comes from the locate context, the same position the
 * navigation follows (the simulator's while it stands in for the device). If
 * the location mode is off, it is switched on without moving the map, and the
 * route is asked for with the first fix.
 *
 * While the route is up, the mode picker is asked for, so the user can switch
 * between walking, cycling and driving; a new mode asks for the route again,
 * from wherever the user is by then.
 *
 * No long press while a navigation runs: the map is the navigation's then.
 */
export const RouteToPoint = ({
  config,
  libreMap,
}: AddonComponentProps<"routeToPoint">) => {
  const { longPressMs = DEFAULT_LONG_PRESS_MS, label = DEFAULT_LABEL } =
    config ?? {};

  const [focused, setActiveRoute] = useActiveRoute();
  const releaseActiveRoute = useReleaseActiveRoute();
  const navigating = useRouteNavigation()?.navigating ?? false;
  const [mode] = useRouteMode();
  const { currentPosition, activate } = useLocate();
  const hasPosition = currentPosition !== null;
  // read when the route is asked for; a fix a second is no reason to ask again
  const positionRef = useRef(currentPosition);
  positionRef.current = currentPosition;

  /** where the popup is open, `[lng, lat]`; null while it is closed */
  const [pressed, setPressed] = useState<[number, number] | null>(null);
  /** where the route goes, once "Route hierher" was pressed */
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!libreMap || navigating) {
      return;
    }
    return onLongPress(libreMap, longPressMs, setPressed);
  }, [libreMap, navigating, longPressMs]);

  // a navigation starting takes the map; an open popup goes with it
  useEffect(() => {
    if (navigating) {
      setPressed(null);
    }
  }, [navigating]);

  /**
   * The popup, rendered by React into a node the MapLibre popup holds. The
   * close listener is taken off before the popup is removed here, so moving
   * it to a new press does not report the old one closing.
   */
  const [popupNode] = useState(() => document.createElement("div"));
  useEffect(() => {
    if (!libreMap || !pressed) {
      return;
    }
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 8,
      maxWidth: "none",
    })
      .setLngLat(pressed)
      .setDOMContent(popupNode)
      .addTo(libreMap);
    const onClose = () => setPressed(null);
    popup.on("close", onClose);
    return () => {
      popup.off("close", onClose);
      popup.remove();
    };
  }, [libreMap, pressed, popupNode]);

  const routeHere = useCallback(() => {
    setDestination(pressed);
    setPressed(null);
  }, [pressed]);

  /**
   * Asks for the route once there is a destination and a position, and again
   * when the mode changes. Without a position the location mode is switched
   * on, and the effect runs again with the first fix.
   */
  const askedRef = useRef(0);
  useEffect(() => {
    if (!destination) {
      return;
    }
    const position = positionRef.current;
    if (!position) {
      setStatus({ text: "Standort wird ermittelt…" });
      activate({ fly: false });
      return;
    }
    const asked = ++askedRef.current;
    setStatus({ text: "Route wird berechnet…" });
    const [toLng, toLat] = destination;
    void fetchRoute({
      from: {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
      },
      to: { lng: toLng, lat: toLat },
      mode: travelModeOf(mode),
    }).then((summary) => {
      if (askedRef.current !== asked) {
        return;
      }
      if (!summary || summary.coordinates.length < 2) {
        console.warn("[ROUTE TO POINT] no route", { destination, mode });
        releaseActiveRoute(ROUTE_SOURCE);
        setStatus({ text: "Keine Route gefunden", error: true });
        return;
      }
      setStatus(null);
      setActiveRoute({
        source: ROUTE_SOURCE,
        coordinates: summary.coordinates,
        label,
        durationInSeconds: summary.durationInSeconds,
        distanceInMeters: summary.distanceInMeters,
        steps: summary.steps,
        mode,
        fromOwnPosition: true,
      });
    });
  }, [
    destination,
    mode,
    hasPosition,
    label,
    activate,
    setActiveRoute,
    releaseActiveRoute,
  ]);

  /**
   * Another producer's route in focus (a picked hit, a test route) replaces
   * this one: the destination is dropped, so a later mode change does not
   * bring it back. Only another producer's: this addon releasing its own
   * route (no route found) leaves the error on the card.
   */
  const othersRoute = focused !== null && focused.source !== ROUTE_SOURCE;
  useEffect(() => {
    if (othersRoute) {
      askedRef.current++;
      setDestination(null);
      setStatus(null);
    }
  }, [othersRoute]);

  const close = useCallback(() => {
    askedRef.current++;
    setDestination(null);
    setStatus(null);
    releaseActiveRoute(ROUTE_SOURCE);
  }, [releaseActiveRoute]);

  // the mode picker, while there is a route here to pick a mode for
  useRouteModeRequest(
    ROUTE_SOURCE,
    "Womit zum Punkt?",
    destination !== null && !navigating
  );

  // the route goes with the addon
  useEffect(() => () => releaseActiveRoute(ROUTE_SOURCE), [releaseActiveRoute]);

  if (!libreMap) {
    return null;
  }

  return (
    <>
      {pressed &&
        createPortal(
          <button
            type="button"
            className="flex h-8 cursor-pointer items-center gap-2 rounded-[8px] border-0 px-3 text-sm font-medium"
            style={{ backgroundColor: ROUTE_BLUE, color: "#ffffff" }}
            onClick={routeHere}
            data-test-id="route-to-point"
          >
            <FontAwesomeIcon icon={getModeIcon(mode)} />
            Route hierher
          </button>,
          popupNode
        )}
      <RoutePreview
        libreMap={libreMap}
        source={ROUTE_SOURCE}
        onClose={close}
        status={destination ? status : null}
      />
    </>
  );
};
