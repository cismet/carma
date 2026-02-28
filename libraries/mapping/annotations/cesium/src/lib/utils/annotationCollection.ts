import { Dispatch, SetStateAction } from "react";
import {
  AnnotationCollection,
  AnnotationEntry,
} from "../types/AnnotationTypes";

type EntryOrConstructor =
  | AnnotationEntry
  | ((prev: AnnotationCollection) => AnnotationEntry);

const isConstructor = (
  entryOrConstructor?: EntryOrConstructor
): entryOrConstructor is (prev: AnnotationCollection) => AnnotationEntry =>
  typeof entryOrConstructor === "function";

export const updateLastOfMeasurementType =
  (entryOrConstructor?: EntryOrConstructor) =>
  (prev: AnnotationCollection) => {
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

export const clearTemporaryMeasurements = (
  setCollection: Dispatch<SetStateAction<AnnotationCollection>>
) => {
  setCollection((prev) => prev.filter((m) => !m.temporary));
};

export const makeTemporaryMeasurementsPermanent = (
  setCollection: Dispatch<SetStateAction<AnnotationCollection>>
) => {
  setCollection((prev) =>
    prev.map((m) => (m.temporary ? { ...m, temporary: false } : m))
  );
};

export const updateCollection = (
  setCollection: Dispatch<SetStateAction<AnnotationCollection>>,
  entryOrConstructor: EntryOrConstructor,
  temporaryMode: boolean
) => {
  setCollection((prevCollection: AnnotationCollection) => {
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
