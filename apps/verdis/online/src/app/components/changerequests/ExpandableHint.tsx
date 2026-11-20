import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Button from "react-bootstrap/Button";

interface ExpandableHintProps {
  hint: string;
  details: ReactNode;
  icon?: string;
  style?: CSSProperties;
}

const ExpandableHint = ({
  hint,
  details,
  icon = "⚠",
  style,
}: ExpandableHintProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ textAlign: "left", ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span aria-hidden="true">{icon}</span>
        <b style={{ flex: "1 1 auto", minWidth: 0 }}>{hint}</b>
        <Button
          variant="link"
          style={{
            padding: 0,
            flexShrink: 0,
            whiteSpace: "nowrap",
            verticalAlign: "baseline",
          }}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Weniger" : "Mehr"}
        </Button>
      </div>
      {expanded && (
        <div style={{ paddingTop: 6, fontSize: "0.9rem" }}>{details}</div>
      )}
    </div>
  );
};

export default ExpandableHint;
