import { useState } from "react";

import {
  ShowStoreError,
  fetchShow,
  type Show,
} from "@carma-mapping/show-remote";

import { draftFromShow, showKeyFrom } from "./open-show";
import type { ShowDraft } from "./show-draft";

export type OpenState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; text: string }
  /** loaded, waiting for the go to replace the scenes in the list */
  | { kind: "pending"; key: string; show: Show }
  | { kind: "opened"; canReplace: boolean };

const loadErrorText = (error: unknown, key: string): string => {
  if (error instanceof ShowStoreError) {
    if (error.status === 404 || error.status === undefined) {
      return `Unter „${key}“ ist keine Show gespeichert.`;
    }
    return `Die Show ließ sich nicht laden (HTTP ${error.status}).`;
  }
  return `Die Show ließ sich nicht laden (${
    error instanceof Error ? error.message : String(error)
  }).`;
};

export type OpenShow = ReturnType<typeof useOpenShow>;

export type UseOpenShowOptions = {
  /** where published shows are read, see `DEFAULT_SHOW_READ_URL` */
  readUrl: string;
  draft: ShowDraft;
  updateDraft: (change: (draft: ShowDraft) => ShowDraft) => void;
  /** how the panel tells that the list changed since the publish */
  fingerprintOf: (draft: ShowDraft) => string;
  /** the list was replaced */
  onOpened: () => void;
};

/**
 * Opening a published show by its key, into the draft. A list with scenes in
 * it is only replaced after a go.
 *
 * The state lives with the caller's component and not in the row: the panel's
 * `Control` registers its children anew on every render.
 */
export const useOpenShow = ({
  readUrl,
  draft,
  updateDraft,
  fingerprintOf,
  onOpened,
}: UseOpenShowOptions) => {
  const [input, setInput] = useState("");
  const [state, setState] = useState<OpenState>({ kind: "idle" });
  const key = showKeyFrom(input);

  const apply = (openedKey: string, show: Show) => {
    const canReplace =
      draft.published?.key === openedKey && !!draft.published.editToken;
    updateDraft((current) => {
      const next = draftFromShow(
        show,
        openedKey,
        current,
        new Date().toISOString()
      );
      return next.published
        ? {
            ...next,
            published: { ...next.published, fingerprint: fingerprintOf(next) },
          }
        : next;
    });
    setInput("");
    setState({ kind: "opened", canReplace });
    onOpened();
  };

  const open = async () => {
    if (!key || state.kind === "busy") {
      return;
    }
    setState({ kind: "busy" });
    try {
      const show = await fetchShow(readUrl, key);
      if (draft.scenes.length === 0) {
        apply(key, show);
      } else {
        setState({ kind: "pending", key, show });
      }
    } catch (error) {
      setState({ kind: "error", text: loadErrorText(error, key) });
    }
  };

  return {
    input,
    setInput: (value: string) => {
      setInput(value);
      if (state.kind !== "busy") {
        setState({ kind: "idle" });
      }
    },
    canOpen: key !== null && state.kind !== "busy",
    state,
    sceneCount: draft.scenes.length,
    open: () => void open(),
    confirm: () => {
      if (state.kind === "pending") {
        apply(state.key, state.show);
      }
    },
    cancel: () => setState({ kind: "idle" }),
  };
};
