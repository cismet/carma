import type { LockInfo } from "./types";

// Java writes "<context>;<object or ->;<time>", the web adds ";<client>".
// Java reads only the first three parts.

const looksLikeTime = (text: string) => /^\d{1,2}\.\d{1,2}\.\d{4}/.test(text);

export const lockTimestamp = (date = new Date()) =>
  date.toLocaleString("de-DE");

// "9.10.2026, 11:22:55" → "9.10.2026, 11:22"
export const withoutSeconds = (time: string) =>
  time.replace(/(\d{1,2}:\d{2}):\d{2}$/, "$1");

export const parseLockInfo = (
  info: string | null | undefined
): LockInfo | undefined => {
  const parts = (info ?? "").split(";").map((part) => part.trim());
  if (parts.length < 3) {
    return undefined;
  }
  const last = parts[parts.length - 1] ?? "";
  const client = parts.length >= 4 && !looksLikeTime(last) ? last : undefined;
  return {
    context: parts[0] ?? "",
    object: parts[1] ?? "",
    time: (client ? parts[parts.length - 2] : last) ?? "",
    ...(client ? { client } : {}),
  };
};

export const formatLockInfo = ({ context, object, time, client }: LockInfo) =>
  [context, object, time, ...(client ? [client] : [])].join(";");
