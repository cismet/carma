// Toast notification for print failures. Shows a short antd `message` toast and
// offers a "Details anzeigen" link that opens a Modal with the concrete error
// text returned by the print backend (MapFish / fetch).
//
// Lives in the ui/ layer (React + antd) so the React-free core barrel stays
// clean. Uses antd's static `message` / `Modal` APIs, matching the rest of the
// codebase (e.g. BelIS forms call `message.error(...)` directly).

import { Button, message, Modal } from "antd";

// Single toast at a time: re-keying replaces the previous one instead of
// stacking a new toast on every failed retry.
const TOAST_KEY = "carma-print-error";

const showPrintErrorDetails = (errorMessage: string) => {
  message.destroy(TOAST_KEY);
  Modal.error({
    title: "Fehler beim Drucken",
    width: 600,
    content: (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 360,
          overflow: "auto",
          margin: 0,
          fontSize: 12,
        }}
      >
        {errorMessage}
      </pre>
    ),
  });
};

/**
 * Show a print-error toast with a link to the concrete error message.
 *
 * @param errorMessage The detailed error text (shown in the details Modal).
 */
export const showPrintErrorToast = (errorMessage: string): void => {
  void message.error({
    key: TOAST_KEY,
    duration: 8,
    content: (
      <span>
        Beim Drucken ist ein Fehler aufgetreten.{" "}
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: "auto" }}
          onClick={() => showPrintErrorDetails(errorMessage)}
        >
          Details anzeigen
        </Button>
      </span>
    ),
  });
};
