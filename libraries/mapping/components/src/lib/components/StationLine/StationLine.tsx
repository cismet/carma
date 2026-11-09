import { useEffect, useState } from "react";

import "./StationLine.css";

export type StationLineStop = {
  name: string;
  /** short text at the end of the row, e.g. the time until the stop */
  note?: string;
  /** dims the row, e.g. for a stop the trip has already passed */
  passed?: boolean;
};

export interface StationLineProps {
  /** The stops along the line, in the order they are drawn. */
  stops: StationLineStop[];
  /**
   * Where the current position is, as an index into `stops`: a whole number at
   * a stop, a fraction on the way between two.
   */
  position?: number;
  /** Makes the rows selectable; without it, they only show the line. */
  onSelect?: (index: number) => void;
}

const ROW_HEIGHT_PX = 30;

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};

/**
 * A line of stops as a diagram: the rows, the line through their dots and the
 * current position, also between two stops. Drawn in white for a dark surface.
 */
export const StationLine = ({ stops, position, onSelect }: StationLineProps) => {
  const isAtStop = position != null && Number.isInteger(position);

  return (
    // the line, the marker and the rows share this box's top
    <div className="carma-station-line">
      <div
        className="carma-station-line__line"
        style={{
          top: ROW_HEIGHT_PX / 2,
          height: (stops.length - 1) * ROW_HEIGHT_PX,
        }}
      />
      {position != null && !isAtStop && (
        <div
          className="carma-station-line__marker"
          style={{ top: (position + 0.5) * ROW_HEIGHT_PX }}
          aria-hidden="true"
        />
      )}
      {stops.map(({ name, note, passed }, index) => {
        const current = isAtStop && position === index;
        const className =
          "carma-station-line__station" +
          (current ? " is-current" : "") +
          (passed ? " is-passed" : "");
        const content = (
          <>
            <span className="carma-station-line__dot" aria-hidden="true" />
            {name}
            {note && <span className="carma-station-line__note">{note}</span>}
          </>
        );
        return onSelect ? (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={current}
            className={className}
            style={{ height: ROW_HEIGHT_PX }}
            onClick={() => onSelect(index)}
          >
            {content}
          </button>
        ) : (
          <div
            key={name}
            aria-current={current ? "location" : undefined}
            className={className}
            style={{ height: ROW_HEIGHT_PX }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
};

export default StationLine;
