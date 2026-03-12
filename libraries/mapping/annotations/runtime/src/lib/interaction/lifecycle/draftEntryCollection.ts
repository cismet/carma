import type { Dispatch, SetStateAction } from "react";

type DraftEntry = {
  id: string;
  type: string;
  temporary?: boolean;
};

type DraftEntryOrFactory<TEntry extends DraftEntry> =
  | TEntry
  | ((previous: TEntry[]) => TEntry);

const resolveDraftEntry = <TEntry extends DraftEntry>(
  entryOrFactory: DraftEntryOrFactory<TEntry>,
  previous: TEntry[]
): TEntry =>
  typeof entryOrFactory === "function"
    ? (entryOrFactory as (previous: TEntry[]) => TEntry)(previous)
    : entryOrFactory;

export const finalizeDraftEntries = <TEntry extends DraftEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>
) => {
  setCollection((previous) =>
    previous.map((entry) =>
      entry.temporary ? { ...entry, temporary: false } : entry
    )
  );
};

export const upsertDraftEntry = <TEntry extends DraftEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>,
  entryOrFactory: DraftEntryOrFactory<TEntry>,
  temporaryMode: boolean
) => {
  setCollection((previousCollection: TEntry[]) => {
    const entry = resolveDraftEntry(entryOrFactory, previousCollection);
    const nextEntry = { ...entry, temporary: temporaryMode };

    const existingIndex = previousCollection.findIndex(
      (candidate) => candidate.id === nextEntry.id
    );
    if (existingIndex >= 0) {
      const nextCollection = [...previousCollection];
      nextCollection[existingIndex] = nextEntry;
      return nextCollection;
    }

    const nextCollection = [...previousCollection];
    if (temporaryMode) {
      const existingTemporaryIndex = nextCollection.findIndex(
        (candidate) => candidate.type === nextEntry.type && candidate.temporary
      );
      if (existingTemporaryIndex >= 0) {
        nextCollection.splice(existingTemporaryIndex, 1);
      }
    }

    nextCollection.push(nextEntry);
    return nextCollection;
  });
};
