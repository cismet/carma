import { Dispatch, SetStateAction } from "react";
import {
  MeasurementCollection,
  MeasurementEntry,
} from "../types/MeasurementTypes";

type EntryOrConstructor =
  | MeasurementEntry
  | ((prev: MeasurementCollection) => MeasurementEntry);

const isConstructor = (
  entryOrConstructor?: EntryOrConstructor
): entryOrConstructor is (prev: MeasurementCollection) => MeasurementEntry =>
  typeof entryOrConstructor === "function";

export const updateLastOfMeasurementType =
  (entryOrConstructor?: EntryOrConstructor) =>
  (prev: MeasurementCollection) => {
    const measurement = isConstructor(entryOrConstructor)
      ? entryOrConstructor(prev)
      : entryOrConstructor;
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

export const updateCollection = (
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  entryOrConstructor: EntryOrConstructor,
  temporaryMode: boolean,
  temporaryMeasurementId?: string | null,
  updateTemporaryMeasurementId?: (id: string) => void
) => {
  setCollection((prevCollection: MeasurementCollection) => {
    const measurement = isConstructor(entryOrConstructor)
      ? entryOrConstructor(prevCollection)
      : entryOrConstructor;

    // Check if an entry with the same ID already exists
    const existingIndex = prevCollection.findIndex(
      (m) => m.id === measurement.id
    );

    if (existingIndex !== -1) {
      // Update existing entry (same ID - continuing same measurement)
      const newCollection = [...prevCollection];
      newCollection[existingIndex] = measurement;
      console.debug(
        `[updateCollection] Updated existing measurement ${measurement.id} at index ${existingIndex}`
      );
      return newCollection;
    } else {
      // Adding a new entry (new ID - starting new measurement)
      if (temporaryMode && temporaryMeasurementId) {
        // In temporary mode, replace only the specific measurement that was created after temporary mode was enabled
        const temporaryMeasurementIndex = prevCollection.findIndex(
          (m) => m.id === temporaryMeasurementId
        );

        let newCollection = [...prevCollection];

        if (temporaryMeasurementIndex !== -1) {
          // Replace the temporary measurement
          newCollection[temporaryMeasurementIndex] = measurement;
          console.debug(
            `[updateCollection] Temporary mode: Replaced temporary measurement ${temporaryMeasurementId} with ${measurement.id} at index ${temporaryMeasurementIndex}`
          );

          // Update the temporary measurement ID to the new one
          if (updateTemporaryMeasurementId) {
            updateTemporaryMeasurementId(measurement.id);
          }
        } else {
          // The temporary measurement doesn't exist anymore, just add the new one
          newCollection.push(measurement);
          console.debug(
            `[updateCollection] Temporary mode: Temporary measurement ${temporaryMeasurementId} not found, added new measurement ${measurement.id}`
          );
        }

        return newCollection;
      } else if (temporaryMode) {
        // In temporary mode but no specific temporary measurement ID yet, just add
        console.debug(
          `[updateCollection] Temporary mode: Added first measurement ${measurement.id}`
        );
        return [...prevCollection, measurement];
      } else {
        // In permanent mode, just add the new measurement
        console.debug(
          `[updateCollection] Adding new measurement ${measurement.id}`
        );
        return [...prevCollection, measurement];
      }
    }
  });
};
