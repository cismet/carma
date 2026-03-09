import { Dispatch, SetStateAction } from "react";

type TemporaryEntry = {
  id: string;
  type: string;
  temporary?: boolean;
};

type EntryOrFactory<TEntry extends TemporaryEntry> =
  | TEntry
  | ((prev: TEntry[]) => TEntry);

const isFactory = <TEntry extends TemporaryEntry>(
  entryOrFactory?: EntryOrFactory<TEntry>
): entryOrFactory is (prev: TEntry[]) => TEntry =>
  typeof entryOrFactory === "function";

export const replaceLastEntryOfType =
  <TEntry extends TemporaryEntry>(entryOrFactory?: EntryOrFactory<TEntry>) =>
  (prev: TEntry[]) => {
    const entry = isFactory(entryOrFactory)
      ? entryOrFactory(prev)
      : entryOrFactory;

    if (!entry) return prev;

    let existingIndex = -1;
    for (let index = prev.length - 1; index >= 0; index -= 1) {
      if (prev[index]?.type === entry.type) {
        existingIndex = index;
        break;
      }
    }
    if (existingIndex < 0) {
      return [...prev, entry];
    }

    const next = [...prev];
    next[existingIndex] = entry;
    return next;
  };

export const clearTemporaryEntries = <TEntry extends TemporaryEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>
) => {
  setCollection((prev) => prev.filter((entry) => !entry.temporary));
};

export const makeTemporaryEntriesPermanent = <TEntry extends TemporaryEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>
) => {
  setCollection((prev) =>
    prev.map((entry) =>
      entry.temporary ? { ...entry, temporary: false } : entry
    )
  );
};

export const upsertCollectionEntry = <TEntry extends TemporaryEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>,
  entryOrFactory: EntryOrFactory<TEntry>,
  temporaryMode: boolean
) => {
  setCollection((prevCollection: TEntry[]) => {
    const entry = isFactory(entryOrFactory)
      ? entryOrFactory(prevCollection)
      : entryOrFactory;
    const nextEntry = { ...entry, temporary: temporaryMode };

    const existingIndex = prevCollection.findIndex(
      (candidate) => candidate.id === nextEntry.id
    );
    if (existingIndex >= 0) {
      const next = [...prevCollection];
      next[existingIndex] = nextEntry;
      return next;
    }

    const next = [...prevCollection];
    if (temporaryMode) {
      const existingTemporaryIndex = next.findIndex(
        (candidate) => candidate.type === nextEntry.type && candidate.temporary
      );
      if (existingTemporaryIndex >= 0) {
        next.splice(existingTemporaryIndex, 1);
      }
    }

    next.push(nextEntry);
    return next;
  });
};
