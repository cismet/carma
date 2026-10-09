import React from "react";
import { notification } from "antd";
import { LockConflictError } from "../../core/editing/locks";
import { errorMessage } from "../../core/editing/session";

// Lock messages stay until closed, so they can be read again. One key per
// kind: a newer message replaces the older one instead of stacking.
// Narrower than antd's 384px, with balanced lines, so short texts read evenly.
const show = (type, key, title, text) =>
  notification[type]({
    key,
    message: title,
    description: (
      <span
        style={{
          whiteSpace: "pre-line",
          // balance evens one paragraph; for a list it would also squeeze the
          // heading line, so lists only avoid single words on a line
          textWrap: text.includes("\n") ? "pretty" : "balance",
        }}
      >
        {text}
      </span>
    ),
    duration: 0,
    placement: "topRight",
    style: { width: 340 },
  });

// a locked object is a warning, a failed request an error
const typeOf = (error) =>
  error instanceof LockConflictError ? "warning" : "error";

export const notifyStartFailed = (error) =>
  show(
    typeOf(error),
    "lock-start",
    "Bearbeitung nicht möglich",
    errorMessage(error)
  );

export const notifyLockCheckFailed = (error) =>
  show(
    typeOf(error),
    "lock-check",
    "Sperre nicht geprüft",
    errorMessage(error)
  );

export const notifyLockLost = (text) =>
  show("warning", "lock-lost", "Sperre verloren", text);

export const notifySaveBlocked = (error) =>
  show("error", "lock-save", "Speichern nicht möglich", errorMessage(error));

export const notifyLocksCleared = (type, text) =>
  show(type, "lock-clear", "Meine Sperren", text);
