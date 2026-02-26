import { useCallback } from "react";

import type {
  MeasurementListType,
  MeasurementsContextType,
} from "../MeasurementsContext";
import type { BaseMeasurementEntry } from "../../types/measurementTypes";

type MeasurementWithId = BaseMeasurementEntry;

type UseMeasurementCollectionSelectorsParams<
  TMode extends string,
  TMeasurement extends MeasurementWithId
> = {
  measurementsByType: (
    type: MeasurementListType<TMode>
  ) => ReadonlyArray<TMeasurement>;
  navigationTypes: ReadonlyArray<MeasurementListType<TMode>>;
};

type MeasurementCollectionSelectors<
  TMode extends string,
  TMeasurement extends MeasurementWithId
> = Pick<
  MeasurementsContextType<TMode, TMeasurement>,
  | "getMeasurementsForNavigation"
  | "getMeasurementIndexByType"
  | "getMeasurementOrderByType"
  | "getNextMeasurementOrderByType"
>;

export const useMeasurementCollectionSelectors = <
  TMode extends string,
  TMeasurement extends MeasurementWithId
>({
  measurementsByType,
  navigationTypes,
}: UseMeasurementCollectionSelectorsParams<
  TMode,
  TMeasurement
>): MeasurementCollectionSelectors<TMode, TMeasurement> => {
  const getMeasurementsForNavigation = useCallback(() => {
    const seenIds = new Set<string>();
    const result: TMeasurement[] = [];

    navigationTypes.forEach((type) => {
      measurementsByType(type).forEach((measurement) => {
        if (seenIds.has(measurement.id)) return;
        seenIds.add(measurement.id);
        result.push(measurement);
      });
    });

    return result;
  }, [measurementsByType, navigationTypes]);

  const getMeasurementIndexByType = useCallback(
    (type: MeasurementListType<TMode>, id: string | null | undefined) => {
      if (!id) return -1;
      return measurementsByType(type).findIndex(
        (measurement) => measurement.id === id
      );
    },
    [measurementsByType]
  );

  const getMeasurementOrderByType = useCallback(
    (type: MeasurementListType<TMode>, id: string | null | undefined) => {
      const index = getMeasurementIndexByType(type, id);
      return index >= 0 ? index + 1 : null;
    },
    [getMeasurementIndexByType]
  );

  const getNextMeasurementOrderByType = useCallback(
    (type: MeasurementListType<TMode>) => measurementsByType(type).length + 1,
    [measurementsByType]
  );

  return {
    getMeasurementsForNavigation,
    getMeasurementIndexByType,
    getMeasurementOrderByType,
    getNextMeasurementOrderByType,
  };
};
