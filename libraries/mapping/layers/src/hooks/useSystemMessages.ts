import { useEffect, useState } from "react";
import { getHashParams, md5FetchJSON } from "@carma-commons/utils";
import { isWithinDateRange } from "../helper/dateHelper";
import { SYSTEM_MESSAGES_URL } from "../helper/assetUrls";

export type SystemMessageSeverity = "info" | "warning" | "danger";

export interface SystemMessage {
  from?: string;
  to?: string;
  severity?: SystemMessageSeverity;
  bg?: string;
  fg?: string;
  content: string;
  hideAfter?: number;
}

type SystemMessagesFile = Record<string, Record<string, SystemMessage[]>>;

const DEBUG_DATE_PATTERN = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/;

const parseDebugDate = (raw: string | null | undefined): Date | undefined => {
  if (!raw) return undefined;
  const match = DEBUG_DATE_PATTERN.exec(raw);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined;
  }
  return date;
};

let messagesPromise: Promise<SystemMessagesFile> | null = null;

const fetchSystemMessages = (): Promise<SystemMessagesFile> => {
  if (!messagesPromise) {
    messagesPromise = md5FetchJSON<unknown>(
      "systemMessages",
      SYSTEM_MESSAGES_URL
    ).then((data) => data as unknown as SystemMessagesFile);
  }
  return messagesPromise;
};

export const useSystemMessages = (
  appKey: string | undefined,
  slot: string
): SystemMessage[] => {
  const [messages, setMessages] = useState<SystemMessage[]>([]);

  useEffect(() => {
    if (!appKey) return;
    let cancelled = false;
    fetchSystemMessages()
      .then((data) => {
        if (cancelled) return;
        const slotMessages = data?.[appKey]?.[slot] ?? [];
        const debugDate =
          typeof window !== "undefined"
            ? parseDebugDate(
                getHashParams()["debugDate"] ??
                  new URLSearchParams(window.location.search).get("debugDate")
              )
            : undefined;
        const active = slotMessages.filter((m) =>
          isWithinDateRange(m.from, m.to, debugDate)
        );
        setMessages(active);
      })
      .catch((e) => {
        console.warn("[systemMessages] fetch failed", e);
      });
    return () => {
      cancelled = true;
    };
  }, [appKey, slot]);

  return messages;
};
