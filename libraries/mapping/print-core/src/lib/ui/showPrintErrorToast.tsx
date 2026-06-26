// Toast notification for print failures. Shows a short antd `message` toast and
// offers a "Details anzeigen" link that opens a Modal with the concrete error
// text returned by the print backend (MapFish / fetch).
//
// Lives in the ui/ layer (React + antd) so the React-free core barrel stays
// clean. Uses antd's static `message` / `Modal` APIs, matching the rest of the
// codebase (e.g. BelIS forms call `message.error(...)` directly).

import { Button, message, Modal } from "antd";

import { PrintErrorDetails } from "./PrintErrorDetails";

// Single toast at a time: re-keying replaces the previous one instead of
// stacking a new toast on every failed retry.
const TOAST_KEY = "carma-print-error";

// Only offer the "Details anzeigen" link once printing has failed this many
// times in a row — a one-off glitch just shows the short toast, a persistent
// problem exposes the technical details. Reset on the next successful print.
const FAILURES_BEFORE_DETAILS = 3;
let consecutiveFailures = 0;

/** Reset the consecutive-failure counter — call after a successful print. */
export const resetPrintErrorCount = (): void => {
  consecutiveFailures = 0;
};

const showPrintErrorDetails = (errorMessage: string) => {
  message.destroy(TOAST_KEY);
  Modal.info({
    title: "Fehler beim Drucken",
    // Drop the default red error glyph and the content indentation it forces.
    icon: null,
    width: 640,
    // No footer button: dismiss via the corner ✕, a backdrop click, or Esc.
    footer: null,
    closable: true,
    maskClosable: true,
    keyboard: true,
    content: <PrintErrorDetails errorMessage={errorMessage} />,
  });
};

/**
 * Show a print-error toast with a link to the concrete error message.
 *
 * @param errorMessage The detailed error text (shown in the details Modal).
 */
export const showPrintErrorToast = (errorMessage: string): void => {
  consecutiveFailures += 1;
  // Surface the technical details only after repeated failures in a row.
  const showDetails = consecutiveFailures >= FAILURES_BEFORE_DETAILS;

  void message.error({
    key: TOAST_KEY,
    duration: 8,
    content: (
      <span>
        Beim Drucken ist ein Fehler aufgetreten.
        {showDetails && (
          <>
            {" "}
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: "auto" }}
              onClick={() => showPrintErrorDetails(errorMessage)}
            >
              Details anzeigen
            </Button>
          </>
        )}
      </span>
    ),
  });
};
