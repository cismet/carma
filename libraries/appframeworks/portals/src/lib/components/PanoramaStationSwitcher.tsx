import { useEffect, useRef, useState } from "react";

import { StationLine, useMediaQuery } from "@carma-mapping/components";

import "./PanoramaStationSwitcher.css";

export interface PanoramaStationSwitcherProps {
  /** Names of the places along the line, in line order. */
  stations: string[];
  /**
   * Where the current pano is, as an index into `stations`: a whole number at
   * a place, a fraction on the way between two.
   */
  position?: number;
  /** Places before and after the current pano in its travel direction. */
  previous?: number;
  next?: number;
  /** Last place of the current trip ("Richtung …"). */
  terminus?: number;
  onSelect: (index: number) => void;
}

// Room for the whole line (20 stations of 30px) beside the pano and between the
// lightbox bars: there the list stays open (docked).
const DOCKED_QUERY = "(min-width: 1200px) and (min-height: 760px)";

const isAt = (position?: number): position is number =>
  position != null && Number.isInteger(position);

/**
 * Station switcher for the panorama lightbox toolbar: steps to the previous /
 * next place along the trip and opens the whole line as a diagram, with the
 * current position marked (also between two places).
 */
export const PanoramaStationSwitcher = ({
  stations,
  position,
  previous,
  next,
  terminus,
  onSelect,
}: PanoramaStationSwitcherProps) => {
  // Docked on a large screen: the list is open from the start and stays open
  // (the button folds it away); otherwise it is a popover.
  const docked = useMediaQuery(DOCKED_QUERY);
  const [open, setOpen] = useState(docked);
  useEffect(() => setOpen(docked), [docked]);
  const rootRef = useRef<HTMLDivElement>(null);

  // the popover closes on a click anywhere else
  useEffect(() => {
    if (!open || docked) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, docked]);

  const select = (index: number) => {
    if (!docked) setOpen(false);
    onSelect(index);
  };

  let label = "Haltestelle wählen";
  if (isAt(position)) {
    label = stations[position];
  } else if (previous != null && next != null) {
    label = `zwischen ${stations[previous]} und ${stations[next]}`;
  } else if (next != null) {
    label = `vor ${stations[next]}`;
  } else if (previous != null) {
    label = `hinter ${stations[previous]}`;
  }

  return (
    <div className="carma-pano-stations" ref={rootRef}>
      <button
        type="button"
        className="carma-pano-stations__step"
        disabled={previous == null}
        onClick={() => previous != null && select(previous)}
        title={
          previous != null
            ? `vorherige Haltestelle: ${stations[previous]}`
            : undefined
        }
        aria-label="vorherige Haltestelle"
      >
        ‹
      </button>
      <button
        type="button"
        className="carma-pano-stations__step"
        disabled={next == null}
        onClick={() => next != null && select(next)}
        title={next != null ? `nächste Haltestelle: ${stations[next]}` : undefined}
        aria-label="nächste Haltestelle"
      >
        ›
      </button>
      <button
        type="button"
        className="carma-pano-stations__current"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="carma-pano-stations__text">
          <span className="carma-pano-stations__name">{label}</span>
          {terminus != null && (
            <span className="carma-pano-stations__direction">
              Richtung {stations[terminus]}
            </span>
          )}
        </span>
        <svg
          className="carma-pano-stations__chevron"
          viewBox="0 0 12 8"
          aria-hidden="true"
        >
          <path d="M1 1.5 L6 6.5 L11 1.5" />
        </svg>
      </button>

      {open && (
        <div
          className={
            "carma-pano-stations__popover" +
            (docked ? " carma-pano-stations__popover--docked" : "")
          }
          role="listbox"
        >
          <StationLine
            stops={stations.map((name) => ({ name }))}
            position={position}
            onSelect={select}
          />
        </div>
      )}
    </div>
  );
};

export default PanoramaStationSwitcher;
