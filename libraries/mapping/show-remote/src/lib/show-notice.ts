/**
 * That a show was published again, for the remotes playing it. pm-show writes
 * it into a session of the show's own after every publish; a remote follows
 * the session of the show it plays and reads the show again when the publish
 * time changes, so a republish reaches it without a reload. The relay code is
 * the show's key, so pm-show needs no display code for it.
 */

import type { RelayTarget } from "./relay-client";

export type ShowNotice = {
  /** the key the show is published under */
  key: string;
  /** the `publishedAt` of the show now stored there */
  publishedAt: string;
};

/** the relay accepts `[A-Z0-9_-]{4,32}` for codes a writer brings along */
export const showNoticeSessionCode = (key: string): string =>
  `${key.trim().toUpperCase()}-S`;

export const showNoticeTarget = (
  baseUrl: string,
  key: string
): RelayTarget => ({ baseUrl, code: showNoticeSessionCode(key) });

export const isShowNotice = (value: unknown): value is ShowNotice =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["key"] === "string" &&
  typeof (value as Record<string, unknown>)["publishedAt"] === "string";
