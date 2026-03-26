import type {
  ViewStateNavigationCommitEvent,
  ViewStateNavigationHistoryView,
} from "../../../core/types";

export const DEFAULT_VIEW_STATE_NAVIGATION_HISTORY_MAX_ENTRIES = 60;

type ViewStateNavigationHistoryBuffer = {
  readonly entries: readonly ViewStateNavigationCommitEvent[];
  readonly maxEntries: number;
};

export const createViewStateNavigationHistoryBuffer = (
  maxEntries = DEFAULT_VIEW_STATE_NAVIGATION_HISTORY_MAX_ENTRIES
): ViewStateNavigationHistoryBuffer => ({
  entries: [],
  maxEntries,
});

export const appendViewStateNavigationHistoryEntry = (
  buffer: ViewStateNavigationHistoryBuffer,
  entry: ViewStateNavigationCommitEvent
): ViewStateNavigationHistoryBuffer => {
  const nextEntries =
    buffer.entries.length >= buffer.maxEntries
      ? [...buffer.entries.slice(1), entry]
      : [...buffer.entries, entry];

  return {
    ...buffer,
    entries: nextEntries,
  };
};

export const readViewStateNavigationHistory = (
  buffer: ViewStateNavigationHistoryBuffer
): ViewStateNavigationHistoryView => ({
  entries: buffer.entries,
  length: buffer.entries.length,
  recent: (count: number) =>
    count <= 0 ? [] : buffer.entries.slice(-Math.floor(count)),
});
