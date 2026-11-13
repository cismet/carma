import { useEffect, useState } from "react";

import {
  StationLine,
  useMediaQuery,
  type StationLineStop,
} from "@carma-mapping/components";

import type { CarInfo, CarLineStop } from "./fleet";

import "./VehicleRidePanel.css";

/** room for the whole line of twenty stops */
const FULL_LIST_QUERY = "(min-height: 860px)";
/** how many stops the panel shows where the whole line does not fit */
const COMPACT_STOPS = 3;

const arrivalNote = (seconds: number | null): string | undefined => {
  if (seconds === null) return undefined;
  if (seconds === 0) return "Halt";
  return seconds < 60
    ? `in ${Math.round(seconds)} s`
    : `in ${Math.round(seconds / 60)} min`;
};

const toRow = ({ name, secondsUntilArrival }: CarLineStop): StationLineStop => ({
  name,
  note: arrivalNote(secondsUntilArrival),
  passed: secondsUntilArrival === null,
});

export type VehicleRidePanelProps = {
  car: CarInfo;
  onExit: () => void;
};

/**
 * What a ride shows instead of the map's controls: the vehicle's stops with the
 * time to each. Where it is going and the way out are in the host's info box,
 * with Escape as a second way out for a host that shows no box.
 */
export const VehicleRidePanel = ({ car, onExit }: VehicleRidePanelProps) => {
  const fullListFits = useMediaQuery(FULL_LIST_QUERY);
  const [expanded, setExpanded] = useState(false);
  const showFullList = fullListFits || expanded;

  // on the window, ahead of the ride's input blocker on the map's container
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onExit]);

  const { line } = car;
  if (!line) {
    return null;
  }
  const upcoming = line.stops
    .filter((stop) => stop.secondsUntilArrival !== null)
    .sort((a, b) => (a.secondsUntilArrival ?? 0) - (b.secondsUntilArrival ?? 0))
    .slice(0, COMPACT_STOPS);

  return (
    <div className="carma-vehicle-ride" data-testid="vehicle-ride-panel">
      {showFullList ? (
        <StationLine stops={line.stops.map(toRow)} position={line.position} />
      ) : (
        // the next stop first, emphasized like the one the vehicle is at
        <StationLine stops={upcoming.map(toRow)} position={0} />
      )}
      {!fullListFits && (
        <button
          type="button"
          className="carma-vehicle-ride__button"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? "Weniger Haltestellen" : "Alle Haltestellen"}
        </button>
      )}
    </div>
  );
};
