import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faThumbsUp, faThumbsDown } from "@fortawesome/free-solid-svg-icons";

export type TriState = "positiv" | "neutral" | "negativ";

interface TriStateFilterButtonProps {
  label: string;
  state: TriState;
  onChange: (newState: TriState) => void;
  footnote?: string;
}

const btnBase: React.CSSProperties = {
  border: "1px solid #ddd",
  background: "#f8f9fa",
  padding: "1px 6px",
  cursor: "pointer",
  fontSize: "11px",
  lineHeight: 1,
};

export const TriStateFilterButton = ({
  label,
  state,
  onChange,
  footnote,
}: TriStateFilterButtonProps) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "1px 0",
      }}
    >
      <div
        style={{
          whiteSpace: "nowrap",
          flex: "1 1 auto",
          fontSize: "13px",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
        {footnote && <span style={{ color: "#888" }}>{footnote}</span>}
      </div>
      <div style={{ display: "flex", flexShrink: 0 }}>
        <button
          onClick={() => onChange("positiv")}
          title="Ausgewählt"
          style={{
            ...btnBase,
            borderRadius: "3px 0 0 3px",
            color: state === "positiv" ? "#9FE628" : "#bbb",
          }}
        >
          <FontAwesomeIcon icon={faThumbsUp} />
        </button>
        <button
          onClick={() => onChange("neutral")}
          title="Neutral"
          style={{
            ...btnBase,
            borderRadius: 0,
            borderLeft: "none",
            borderRight: "none",
            color: state === "neutral" ? "#333" : "#bbb",
            fontWeight: state === "neutral" ? "bold" : "normal",
          }}
        >
          -
        </button>
        <button
          onClick={() => onChange("negativ")}
          title="Ausgeschlossen"
          style={{
            ...btnBase,
            borderRadius: "0 3px 3px 0",
            color: state === "negativ" ? "#C33D17" : "#bbb",
          }}
        >
          <FontAwesomeIcon icon={faThumbsDown} />
        </button>
      </div>
    </div>
  );
};
