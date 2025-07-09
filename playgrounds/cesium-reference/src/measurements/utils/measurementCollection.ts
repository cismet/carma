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
  temporaryMode: boolean
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
      if (temporaryMode) {
        // In temporary mode, remove the last measurement of the same type when starting a new one
        const filteredCollection = prevCollection.filter(
          (m) => m.type !== measurement.type
        );
        console.debug(
          `[updateCollection] Temporary mode: Replaced measurement of type ${measurement.type} with new measurement ${measurement.id}`
        );
        return [...filteredCollection, measurement];
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
