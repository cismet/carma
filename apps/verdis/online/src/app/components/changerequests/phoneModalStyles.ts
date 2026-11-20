import type { CSSProperties } from "react";

// shared by the change request dialogs, which go full screen on phones (cr-modal-phone)
export const phoneTitleStyle = (isPhone: boolean): CSSProperties =>
  isPhone
    ? {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "1.15rem",
        lineHeight: 1.25,
      }
    : {};
