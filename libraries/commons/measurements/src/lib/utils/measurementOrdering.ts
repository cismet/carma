export const buildMeasurementOrderById = <
  TMeasurement extends {
    id: string;
  }
>(
  measurements: readonly TMeasurement[]
): Record<string, number> =>
  measurements.reduce<Record<string, number>>(
    (orderById, measurement, index) => {
      orderById[measurement.id] = index + 1;
      return orderById;
    },
    {}
  );
