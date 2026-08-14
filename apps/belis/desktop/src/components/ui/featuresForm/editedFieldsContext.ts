import { createContext, useContext } from "react";

/**
 * Leaf paths (e.g. "leuchte.wechseldatum") the user actually edited in the
 * current draft — `getManagedChangedPaths` of the draft against the feature's
 * saved values.
 *
 * Deliberately narrower than the `ChangedFieldsContext` that drives the gray
 * highlight, in two ways. That set folds in allowlisted fields which merely
 * diverge from the remembered creation default, which are not user edits; and
 * it diffs the whole baseline, including slices the open form cannot edit — a
 * view-mode Leuchte's parent `mast`, whose untouched fields would otherwise
 * all read as changed. Consumers that count or capture "what did I change
 * here" (the header's draft badge) want this set.
 *
 * Lives outside `DraftFieldHighlight` so that component module keeps exporting
 * only components (react-refresh/only-export-components).
 */
export const EditedFieldsContext = createContext<Set<string>>(new Set());

/** Empty outside a `ChangedFieldsProvider`. */
export const useEditedFields = () => useContext(EditedFieldsContext);
