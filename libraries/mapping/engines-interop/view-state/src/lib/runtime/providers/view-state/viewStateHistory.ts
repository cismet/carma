import {
  createRingBuffer,
  pushRingBufferEntry,
  readRingBufferEntries,
  type RingBuffer,
} from "@carma-commons/utils";
import type {
  HistoryConfig,
  HistoryEntry,
  HistoryView,
} from "../../../core/types";

// Reuse note:
// The generic ring-buffer primitive already lives in @carma-commons/utils.
// This module stays in view-state because HistoryEntry/HistoryView are
// view-state domain contracts. Promote higher-level helpers to commons only
// once a second non-view-state consumer needs the same API shape.
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxEntries: 120,
  snapshotIntervalMs: 500,
};

export type ViewStateHistoryBuffer = {
  readonly entries: RingBuffer<HistoryEntry>;
};

export const createViewStateHistoryBuffer = (
  maxEntries: number
): ViewStateHistoryBuffer => ({
  entries: createRingBuffer<HistoryEntry>(maxEntries),
});

export const appendViewStateHistoryEntry = (
  history: ViewStateHistoryBuffer,
  entry: HistoryEntry
): ViewStateHistoryBuffer => ({
  entries: pushRingBufferEntry(history.entries, entry),
});

const nearestHistoryEntry = (
  entries: readonly HistoryEntry[],
  timestampMs: number
): HistoryEntry | null => {
  if (entries.length === 0) return null;
  let best = entries[0];
  let bestDist = Math.abs(best.timestampMs - timestampMs);

  for (let i = 1; i < entries.length; i++) {
    const dist = Math.abs(entries[i].timestampMs - timestampMs);
    if (dist < bestDist) {
      best = entries[i];
      bestDist = dist;
    }
  }

  return best;
};

const lastHistoryEntryFromSource = (
  entries: readonly HistoryEntry[],
  sourceId: string
): HistoryEntry | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].sourceId === sourceId) {
      return entries[i];
    }
  }
  return null;
};

export const readViewStateHistory = (
  history: ViewStateHistoryBuffer
): HistoryView => {
  const snapshot = readRingBufferEntries(history.entries);
  return {
    entries: snapshot,
    length: snapshot.length,
    oldestTimestampMs: snapshot.length > 0 ? snapshot[0].timestampMs : null,
    newestTimestampMs:
      snapshot.length > 0 ? snapshot[snapshot.length - 1].timestampMs : null,
    nearest: (timestampMs: number): HistoryEntry | null =>
      nearestHistoryEntry(snapshot, timestampMs),
    recent: (count: number): readonly HistoryEntry[] => snapshot.slice(-count),
    lastFrom: (sourceId: string): HistoryEntry | null =>
      lastHistoryEntryFromSource(snapshot, sourceId),
  };
};
