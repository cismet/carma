import {
  notifyLockConflict,
  notifyLockMessage,
} from "@carma-providers/locking";
import { LockConflictError } from "../../core/editing/locks";
import { errorMessage } from "../../core/editing/session";

export const notifyStartFailed = (error) =>
  error instanceof LockConflictError
    ? notifyLockConflict(error.conflicts)
    : notifyLockMessage(
        "error",
        "lock-start",
        "Bearbeitung nicht möglich",
        errorMessage(error)
      );

export const notifyLocksCleared = (type, text) =>
  notifyLockMessage(type, "lock-clear", "Meine Sperren", text);
