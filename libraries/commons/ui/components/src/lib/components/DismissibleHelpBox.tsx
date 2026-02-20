import { ReactNode, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export interface DismissibleHelpBoxProps {
  content: ReactNode;
  onClose?: () => void;
  dataTestId?: string;
}

export const DismissibleHelpBox = ({
  content,
  onClose,
  dataTestId,
}: DismissibleHelpBoxProps) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Hilfe anzeigen"
        onClick={() => setCollapsed(false)}
        style={{
          width: 20,
          height: 20,
          border: "none",
          borderRadius: 999,
          backgroundColor: "transparent",
          color: "#6b7280",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        data-test-id={
          dataTestId
            ? `${dataTestId}-collapsed-btn`
            : "dismissible-help-box-collapsed-btn"
        }
      >
        <FontAwesomeIcon icon={faCircleQuestion} />
      </button>
    );
  }

  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        backgroundColor: "#ffffff",
        padding: "6px 8px",
        width: "100%",
        boxSizing: "border-box",
        position: "relative",
      }}
      data-test-id={dataTestId}
    >
      <button
        type="button"
        aria-label="Hilfe schließen"
        onClick={() => {
          onClose?.();
          setCollapsed(true);
        }}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          border: "none",
          borderRadius: 999,
          backgroundColor: "transparent",
          color: "#6b7280",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        data-test-id={
          dataTestId
            ? `${dataTestId}-close-btn`
            : "dismissible-help-box-close-btn"
        }
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          paddingRight: 20,
        }}
      >
        <FontAwesomeIcon
          icon={faCircleQuestion}
          style={{ marginTop: 1, color: "#6b7280", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>{content}</div>
      </div>
    </div>
  );
};

export default DismissibleHelpBox;
