import { useState } from "react";

import { draftFileName, draftFileOf, draftFromFile } from "./draft-file";
import type { ShowDraft } from "./show-draft";

export type DraftFileState =
  | { kind: "idle" }
  | { kind: "error"; text: string }
  /** read, waiting for the go to replace the scenes in the list */
  | { kind: "pending"; fileName: string; draft: ShowDraft }
  | { kind: "loaded"; fileName: string };

export type DraftFile = ReturnType<typeof useDraftFile>;

export type UseDraftFileOptions = {
  draft: ShowDraft;
  updateDraft: (change: (draft: ShowDraft) => ShowDraft) => void;
  /** the list was replaced */
  onLoaded: () => void;
};

/**
 * Saving the draft as a JSON file and loading one back (`draft-file.ts`). A
 * list with scenes in it is only replaced after a go.
 *
 * The state lives with the caller's component and not in the row: the panel's
 * `Control` registers its children anew on every render.
 */
export const useDraftFile = ({
  draft,
  updateDraft,
  onLoaded,
}: UseDraftFileOptions) => {
  const [state, setState] = useState<DraftFileState>({ kind: "idle" });

  const save = () => {
    const now = new Date();
    const blob = new Blob(
      [JSON.stringify(draftFileOf(draft, now.toISOString()), null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = draftFileName(draft, now);
    link.click();
    // after the click has handed the file to the browser
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setState({ kind: "idle" });
  };

  const apply = (next: ShowDraft, fileName: string) => {
    updateDraft(() => next);
    setState({ kind: "loaded", fileName });
    onLoaded();
  };

  const load = async (file: File) => {
    try {
      const next = await draftFromFile(JSON.parse(await file.text()));
      if (!next) {
        setState({
          kind: "error",
          text: `„${file.name}“ ist weder eine gespeicherte noch eine veröffentlichte Show.`,
        });
      } else if (draft.scenes.length === 0) {
        apply(next, file.name);
      } else {
        setState({ kind: "pending", fileName: file.name, draft: next });
      }
    } catch (error) {
      setState({
        kind: "error",
        text: `„${file.name}“ ließ sich nicht lesen (${
          error instanceof Error ? error.message : String(error)
        }).`,
      });
    }
  };

  return {
    state,
    sceneCount: draft.scenes.length,
    save,
    load: (file: File) => void load(file),
    confirm: () => {
      if (state.kind === "pending") {
        apply(state.draft, state.fileName);
      }
    },
    cancel: () => setState({ kind: "idle" }),
  };
};
