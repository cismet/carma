import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { FotoCycle } from "./HighlightFotoOverlayPreview";

const buttonStyle = {
  border: "none",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  padding: "0 6px",
};

// Stepping bar for an overlapping feature that has no photo to put the
// arrows on (e.g. a crack whose photo is missing), so the user can still
// step on to the others.
const OverlappingFeaturesNavigator = ({
  index,
  count,
  onPrevious,
  onNext,
}: FotoCycle) => (
  <div style={{ textAlign: "right", marginBottom: 5 }}>
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 4px",
        borderRadius: 12,
        background: "rgba(0, 0, 0, 0.55)",
        color: "white",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        title="vorheriges Objekt"
        aria-label="vorheriges Objekt"
        style={buttonStyle}
        onClick={onPrevious}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>
      {index + 1} / {count}
      <button
        type="button"
        title="nächstes Objekt"
        aria-label="nächstes Objekt"
        style={buttonStyle}
        onClick={onNext}
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  </div>
);

export default OverlappingFeaturesNavigator;
