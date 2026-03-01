import { Dispatch, SetStateAction } from "react";

type TemporaryEntry = {
  id: string;
  type: string;
  temporary?: boolean;
};

type EntryOrConstructor<TEntry extends TemporaryEntry> =
  | TEntry
  | ((prev: TEntry[]) => TEntry);

const isConstructor = <TEntry extends TemporaryEntry>(
  entryOrConstructor?: EntryOrConstructor<TEntry>
): entryOrConstructor is (prev: TEntry[]) => TEntry =>
  typeof entryOrConstructor === "function";

export const updateLastOfMeasurementType =
  <TEntry extends TemporaryEntry>(
    entryOrConstructor?: EntryOrConstructor<TEntry>
  ) =>
  (prev: TEntry[]) => {
    const measurement = isConstructor(entryOrConstructor)
      ? entryOrConstructor(prev)
      : entryOrConstructor;

    if (!measurement) return prev;

    const type = measurement.type;
    const existingIndex = prev
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.type === type)
      .map(({ i }) => i)
      .pop();
    if (existingIndex !== undefined) {
      const newCollection = [...prev];
      newCollection[existingIndex] = measurement;
      console.debug(
        `[updateLastOfMeasurementType] Updated existing measurement of type ${type} at index ${existingIndex}`
      );
      return newCollection;
    }
    console.debug(
      `[updateLastOfMeasurementType] Adding new measurement of type ${type}`
    );
    return [...prev, measurement];
  };

export const clearTemporaryMeasurements = <TEntry extends TemporaryEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>
) => {
  setCollection((prev) => prev.filter((m) => !m.temporary));
};

export const makeTemporaryMeasurementsPermanent = <
  TEntry extends TemporaryEntry
>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>
) => {
  setCollection((prev) =>
    prev.map((m) => (m.temporary ? { ...m, temporary: false } : m))
  );
};

export const updateCollection = <TEntry extends TemporaryEntry>(
  setCollection: Dispatch<SetStateAction<TEntry[]>>,
  entryOrConstructor: EntryOrConstructor<TEntry>,
  temporaryMode: boolean
) => {
  setCollection((prevCollection: TEntry[]) => {
    const measurement = isConstructor(entryOrConstructor)
      ? entryOrConstructor(prevCollection)
      : entryOrConstructor;

    // Create updated measurement with temporary flag (preserve immutability)
    const updatedMeasurement = { ...measurement, temporary: temporaryMode };

    // Check if an entry with the same ID already exists
    const existingIndex = prevCollection.findIndex(
      (m) => m.id === updatedMeasurement.id
    );

    if (existingIndex !== -1) {
      // Update existing entry (same ID - continuing same measurement)
      const newCollection = [...prevCollection];
      newCollection[existingIndex] = updatedMeasurement;
      console.debug(
        `[updateCollection] Updated existing measurement ${updatedMeasurement.id} at index ${existingIndex}`
      );
      return newCollection;
    } else {
      // Adding a new entry (new ID - starting new measurement)
      let newCollection = [...prevCollection];

      if (temporaryMode) {
        // Remove any existing temporary measurement of the same type
        const existingTemporaryIndex = newCollection.findIndex(
          (m) => m.type === updatedMeasurement.type && m.temporary
        );

        if (existingTemporaryIndex !== -1) {
          newCollection.splice(existingTemporaryIndex, 1);
          console.debug(
            `[updateCollection] Temporary mode: Removed existing temporary measurement of type ${updatedMeasurement.type}`
          );
        }
      }

      // Add the new measurement
      newCollection.push(updatedMeasurement);
      console.debug(
        `[updateCollection] Added new measurement ${updatedMeasurement.id}${
          temporaryMode ? " (temporary)" : ""
        }`
      );

      return newCollection;
    }
  });
};
