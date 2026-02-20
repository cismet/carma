import { createElement, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export function DismissibleHelpBox({ content, onClose, dataTestId }) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return createElement(
      "button",
      {
        type: "button",
        "aria-label": "Hilfe anzeigen",
        onClick: () => setCollapsed(false),
        style: {
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
        },
        "data-test-id": dataTestId
          ? `${dataTestId}-collapsed-btn`
          : "dismissible-help-box-collapsed-btn",
      },
      createElement(FontAwesomeIcon, { icon: faCircleQuestion })
    );
  }

  return createElement(
    "div",
    {
      style: {
        borderRadius: 6,
        border: "1px solid #d1d5db",
        backgroundColor: "#ffffff",
        padding: "6px 8px",
        width: "100%",
        boxSizing: "border-box",
        position: "relative",
      },
      "data-test-id": dataTestId,
    },
    createElement(
      "button",
      {
        type: "button",
        "aria-label": "Hilfe schließen",
        onClick: () => {
          onClose?.();
          setCollapsed(true);
        },
        style: {
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
        },
        "data-test-id": dataTestId
          ? `${dataTestId}-close-btn`
          : "dismissible-help-box-close-btn",
      },
      createElement(FontAwesomeIcon, { icon: faXmark })
    ),
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          paddingRight: 20,
        },
      },
      createElement(FontAwesomeIcon, {
        icon: faCircleQuestion,
        style: { marginTop: 1, color: "#6b7280", flexShrink: 0 },
      }),
      createElement("div", { style: { minWidth: 0 } }, content)
    )
  );
}

export default DismissibleHelpBox;
