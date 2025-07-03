import { Dispatch, SetStateAction } from "react";
import {
  MeasurementCollection,
  MeasurementEntry,
} from "../types/MeasurementTypes";

export const updateLastOfMeasurementType =
  <T extends MeasurementEntry>(measurement: T) =>
  (prev: MeasurementCollection) => {
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
  measurement: T,
  soloMode: boolean
) => {
  if (soloMode) {
    setCollection(updateLastOfMeasurementType(measurement));
  } else {
    setCollection((prevCollection: MeasurementCollection) => [
      ...prevCollection,
      measurement,
    ]);
  }
};
