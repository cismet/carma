import { useEffect, useRef, type CSSProperties } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { Positions } from "@carma-mapping/map-controls-layout";
import {
  ROUTE_BLUE,
  formatArrivalTime,
  formatRouteSummary,
  getModeIcon,
} from "@carma-mapping/routing";

import { useActiveRoute, useRouteNavigation } from "../Routing/routeChannel";
import { DEFAULT_ROUTE_MODE } from "../Routing/routeModeChannel";
import { useMinuteTick } from "../Routing/useMinuteTick";
import { BottomCard } from "./BottomCard";
import { useNarrow } from "./useNarrow";
import {
  clearPreviewLine,
  drawPreviewLine,
  previewLineIsDrawn,
} from "./previewLine";

/**
 * A route in focus that has no info box to sit in, and what to do with it.
 *
 * The navigation's button lives in the info box of a picked feature. A test
 * route or a route to a long-pressed point has no picked feature, so there is
 * no box and no button; this is both for them: the line on the map, the map
 * fitted around it once, and a card at the bottom with what the route costs,
 * "Starten" and a ✕ that drops it.
 *
 * Only for the producer's own route (`source`), and only while no navigation
 * runs: once it starts, the routing addon draws the driven line and its card
 * takes the bottom. After arrival the route is still in focus, so the card
 * comes back with it for the next run.
 */

const START_BUTTON_STYLE: CSSProperties = {
  backgroundColor: ROUTE_BLUE,
  color: "#ffffff",
};

/**
 * room around the route when the map is fitted to it; the card is at the
 * bottom, and on a phone under the search and the picker
 */
const FIT_PADDING = { top: 80, bottom: 140, left: 60, right: 60 };
const NARROW_FIT_PADDING = { top: 80, bottom: 220, left: 30, right: 30 };
const FIT_MAX_ZOOM = 17;
const FIT_DURATION = 800;

export type RoutePreviewProps = {
  libreMap: MaplibreMap | null | undefined;
  /** whose routes this shows: the `source` the producer publishes them under */
  source: string;
  /** what the ✕ does: the producer drops its route and whatever led to it */
  onClose: () => void;
  /**
   * a word in place of the route while there is none yet: "Route wird
   * berechnet…", or what went wrong
   */
  status?: { text: string; error?: boolean } | null;
  /** default bottom centre, and the bottom-left column on a phone */
  position?: Positions;
  order?: number;
};

export const RoutePreview = ({
  libreMap,
  source,
  onClose,
  status = null,
  position,
  order,
}: RoutePreviewProps) => {
  const narrow = useNarrow();
  const [focused] = useActiveRoute();
  const route = focused?.source === source ? focused : null;
  const coordinates = route?.coordinates ?? null;
  const navigation = useRouteNavigation();
  const navigating = navigation?.navigating ?? false;

  // read when a route arrives; turning the phone is no reason to fit again
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;

  // the map goes to a new route once, when it arrives; the user may pan away
  // from it after that
  useEffect(() => {
    if (!libreMap || !coordinates || coordinates.length < 2) {
      return;
    }
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of coordinates) {
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    }
    libreMap.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: narrowRef.current ? NARROW_FIT_PADDING : FIT_PADDING,
        maxZoom: FIT_MAX_ZOOM,
        duration: FIT_DURATION,
      }
    );
  }, [libreMap, coordinates]);

  // the line, while the route is only looked at; redrawn after a style
  // rebuild, which drops every source
  useEffect(() => {
    if (!libreMap || !coordinates || navigating) {
      return;
    }
    drawPreviewLine(libreMap, coordinates);
    const onStyleData = () => {
      if (!previewLineIsDrawn(libreMap)) {
        drawPreviewLine(libreMap, coordinates);
      }
    };
    libreMap.on("styledata", onStyleData);
    return () => {
      libreMap.off("styledata", onStyleData);
      clearPreviewLine(libreMap);
    };
  }, [libreMap, coordinates, navigating]);

  useMinuteTick();

  if (!libreMap || navigating || (!route && !status)) {
    return null;
  }

  const summary =
    route?.durationInSeconds !== undefined &&
    route.distanceInMeters !== undefined
      ? `${formatRouteSummary(
          route.durationInSeconds,
          route.distanceInMeters
        )} · ${formatArrivalTime(route.durationInSeconds)}`
      : null;

  return (
    <BottomCard testId="route-preview" position={position} order={order}>
      {route ? (
        <>
          <FontAwesomeIcon
            icon={getModeIcon(route.mode ?? DEFAULT_ROUTE_MODE)}
            className="shrink-0 text-xl text-gray-600"
          />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            {route.label && (
              <span className="truncate text-base font-medium">
                {route.label}
              </span>
            )}
            {summary && (
              <span className="truncate text-sm tabular-nums text-gray-600">
                {summary}
              </span>
            )}
          </div>
          <button
            type="button"
            className="h-8 shrink-0 cursor-pointer rounded-[8px] border-0 px-3 text-sm font-medium"
            style={START_BUTTON_STYLE}
            onClick={() => navigation?.start()}
            disabled={!navigation}
            data-test-id="route-preview-start"
          >
            Starten
          </button>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FontAwesomeIcon
            icon={status?.error ? faTriangleExclamation : faCircleNotch}
            spin={!status?.error}
            className={`shrink-0 text-xl ${
              status?.error ? "text-red-600" : "text-gray-600"
            }`}
          />
          <span className="truncate text-sm text-gray-600">{status?.text}</span>
        </div>
      )}
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-500 hover:bg-black/5"
        onClick={onClose}
        aria-label="Route verwerfen"
        title="Route verwerfen"
        data-test-id="route-preview-close"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </BottomCard>
  );
};
