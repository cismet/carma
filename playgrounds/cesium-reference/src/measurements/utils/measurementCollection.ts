import { Dispatch, SetStateAction } from "react";
import {
  MeasurementCollection,
  MeasurementEntry,
} from "../types/MeasurementTypes";

export const updateLastOfMeasurementType =
  (
    entryOrConstructor?:
      | MeasurementEntry
      | ((prev: MeasurementCollection) => MeasurementEntry)
  ) =>
  (prev: MeasurementCollection) => {
    const measurement =
      typeof entryOrConstructor === "function"
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

export const updateCollection = <T extends MeasurementEntry>(
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  entryConstructor: (prev: MeasurementCollection) => MeasurementEntry,
  soloMode: boolean
) => {
  if (soloMode) {
    setCollection(updateLastOfMeasurementType(entryConstructor));
  } else {
    setCollection((prevCollection: MeasurementCollection) => [
      ...prevCollection,
      entryConstructor(prevCollection),
    ]);
  }
};
