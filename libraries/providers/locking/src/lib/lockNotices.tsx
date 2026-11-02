import { Modal } from "antd";
import { ConflictList, SingleConflict } from "./LockConflicts";
import { LockDialogBody } from "./LockDialog";
import type { ReactNode } from "react";
import type { LockConflict } from "./LockConflicts";
import type { LockNote } from "./LockDialog";

export type LockNoticeType = "success" | "info" | "warning" | "error";

const open = new Map<string, { destroy: () => void }>();

// Same layout as the lock dialogs, only with an OK button. One key per kind:
// a newer notice replaces the older one instead of stacking.
const show = (
  key: string,
  title: string,
  details: ReactNode,
  note?: LockNote
) => {
  open.get(key)?.destroy();
  open.set(
    key,
    Modal.info({
      icon: null,
      title,
      width: 520,
      okText: "OK",
      content: <LockDialogBody details={details} note={note} />,
      afterClose: () => {
        open.delete(key);
      },
    })
  );
};

const titleOf = (conflict: LockConflict) =>
  conflict.own
    ? `${conflict.objectLabel} ist von Ihnen gesperrt`
    : `${conflict.objectLabel} wird von ${conflict.lock.userString} bearbeitet`;

export const notifyLockConflict = (conflicts: LockConflict[]) => {
  const [first] = conflicts;
  if (!first) {
    return;
  }
  if (conflicts.length === 1) {
    show("lock-start", titleOf(first), <SingleConflict conflict={first} />);
  } else {
    show(
      "lock-start",
      "Diese Objekte sind gesperrt",
      <ConflictList conflicts={conflicts} />
    );
  }
};

const NOTE_TYPES = {
  success: "info",
  info: "info",
  warning: "warning",
  error: "error",
} as const;

// a text message, shown as the note of an otherwise empty dialog
export const notifyLockMessage = (
  type: LockNoticeType,
  key: string,
  title: string,
  text: string
) => {
  show(key, title, null, { type: NOTE_TYPES[type], message: text });
};
