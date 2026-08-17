import type { CSSProperties } from "react";

/**
 * Look of the Wiederholfelder copy/paste buttons. Shared so the batch paste in
 * the card header is visibly the same control as the one in the Datenblatt
 * header — it does the same thing to many features instead of one.
 *
 * Lives in its own module rather than on `FormHeader`: exporting a non-component
 * value from a component file trips react-refresh.
 */

// A 24×24 square matching the header's "+" button, in the neutral palette that
// button's "white" variant uses.
export const REPEATABLE_CHANGES_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  backgroundColor: "#ffffff",
  color: "#8c8c8c",
  cursor: "pointer",
};

// Copy wears the changed-field gray, so it reads as "take the gray fields".
// Kept in sync by hand with the `.draft-changed-field` background in
// DraftFieldHighlight.tsx — that stylesheet is built inside a component module
// and cannot export the value without tripping react-refresh.
export const REPEATABLE_CHANGES_COPY_STYLE: CSSProperties = {
  ...REPEATABLE_CHANGES_BUTTON_STYLE,
  backgroundColor: "#f5f5f5",
};

/** Badge colour used for the stored-field count on every paste button. */
export const REPEATABLE_CHANGES_BADGE_COLOR = "#fa8c16";
