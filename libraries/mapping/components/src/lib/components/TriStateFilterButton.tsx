import { Button, ButtonGroup, ButtonToolbar } from "react-bootstrap";
import Icon from "react-cismap/commons/Icon";

export type TriState = "positiv" | "neutral" | "negativ";

interface TriStateFilterButtonProps {
  label: string;
  state: TriState;
  onChange: (newState: TriState) => void;
  footnote?: string;
}

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
      }}
    >
      <div
        style={{
          whiteSpace: "nowrap",
          flex: "1 1 auto",
        }}
      >
        {label}
        {footnote && <span>{footnote}</span>}
      </div>
      <ButtonToolbar style={{ flexShrink: 0, marginLeft: 8 }}>
        <ButtonGroup>
          <Button
            variant="light"
            size="sm"
            onClick={() =>
              onChange(state === "positiv" ? "neutral" : "positiv")
            }
            title="Ausgewählt"
            style={{
              color: state === "positiv" ? "#9FE628" : "grey",
            }}
          >
            <Icon name="thumbs-up" />
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() => onChange("neutral")}
            title="Neutral"
            style={{
              color: state === "neutral" ? "black" : "grey",
            }}
          >
            -
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() =>
              onChange(state === "negativ" ? "neutral" : "negativ")
            }
            title="Ausgeschlossen"
            style={{
              color: state === "negativ" ? "#C33D17" : "grey",
            }}
          >
            <Icon name="thumbs-down" />
          </Button>
        </ButtonGroup>
      </ButtonToolbar>
    </div>
  );
};
