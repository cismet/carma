import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Button from "react-bootstrap/Button";

interface ExpandableHintProps {
  hint: string;
  details: ReactNode;
  icon?: string;
  style?: CSSProperties;
}

// short bold hint for phones; "Mehr…" shows the full text
const ExpandableHint = ({
  hint,
  details,
  icon = "⚠",
  style,
}: ExpandableHintProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ textAlign: "left", ...style }}>
      <b>
        {icon} {hint}
      </b>{" "}
      <Button
        variant="link"
        style={{ padding: 0, verticalAlign: "baseline" }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Weniger" : "Mehr…"}
      </Button>
      {expanded && <div style={{ paddingTop: 8 }}>{details}</div>}
    </div>
  );
};

export default ExpandableHint;
