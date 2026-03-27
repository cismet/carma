export const readRestoredQueryPosition = (
  queryX: number | undefined,
  queryY: number | undefined
): [number, number] | undefined =>
  Number.isFinite(queryX) && Number.isFinite(queryY)
    ? ([queryX, queryY] as [number, number])
    : undefined;

export const buildFloodingmapInitialState = <
  TState extends {
    featureInfoModeActivated?: boolean;
    currentFeatureInfoPosition?: [number, number] | undefined;
  }
>(
  baseState: TState,
  queryX: number | undefined,
  queryY: number | undefined
): TState => {
  const restoredQueryPosition = readRestoredQueryPosition(queryX, queryY);

  return {
    ...baseState,
    featureInfoModeActivated: Boolean(restoredQueryPosition),
    currentFeatureInfoPosition: restoredQueryPosition,
  };
};
