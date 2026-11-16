import type { ReactNode } from "react";
import Button from "react-bootstrap/Button";
import ExpandableHint from "./ExpandableHint";

interface PhoneModalFooterProps {
  hint: string;
  details: ReactNode;
  onCancel: () => void;
  onApply: () => void;
}

const PhoneModalFooter = ({
  hint,
  details,
  onCancel,
  onApply,
}: PhoneModalFooterProps) => {
  return (
    <div style={{ width: "100%" }}>
      <ExpandableHint
        hint={hint}
        details={details}
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button style={{ flex: "1 1 0" }} variant="warning" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button style={{ flex: "1 1 0" }} variant="primary" onClick={onApply}>
          Übernehmen
        </Button>
      </div>
      <div
        style={{
          fontSize: 11,
          textAlign: "center",
          color: "#6c757d",
          marginTop: 6,
        }}
      >
        Beim Abbrechen werden Ihre Eingaben verworfen.
      </div>
    </div>
  );
};

export default PhoneModalFooter;
