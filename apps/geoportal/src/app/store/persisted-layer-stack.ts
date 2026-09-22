/** a layer row as it goes through storage, before the slice types it */
export type PersistedLayer = {
  id?: string;
  tools?: unknown[];
  interactionButtons?: unknown;
  permanent?: boolean;
};

/**
 * Every row loses its `interactionButtons`: mode rows (measurement,
 * comparison, the time series) carry live React elements there, which are
 * circular in dev (`_owner` is a fiber) and would abort any JSON write. The
 * running session never reads them back, the owning mode hands the host fresh
 * buttons on every change.
 */
export const stripInteractionButtons = <T extends PersistedLayer>(
  layers: T[]
): T[] =>
  layers.map((layer) =>
    layer && typeof layer === "object" && layer.interactionButtons !== undefined
      ? { ...layer, interactionButtons: undefined }
      : layer
  );

/**
 * Whether a row can come back from a stored or shared stack, which is also
 * what decides whether it can be shared: what a link carries is a stack.
 *
 * A row whose id starts with `__` is the layer bar's handle on a running mode
 * and that mode adds its row again at startup, with one exception: a workflow
 * row that carries `tools` holds its own relaunch config (a time series embeds
 * its series there, a comparison its assignment, the way a workflow card does)
 * and is exactly what its mode needs at boot. Generic modes (measurement,
 * annotation, highlighting) carry none and stay with their route.
 *
 * A permanent row fails either way. It is the app's, built from the config on
 * every boot (see `constants/default-workflows`), so a restored one could only
 * be an older reading of a definition that has since been edited.
 */
export const isRestorableRow = (layer: PersistedLayer | undefined): boolean =>
  !layer?.permanent &&
  (!layer?.id?.startsWith("__") || (layer.tools?.length ?? 0) > 0);

/** Drops the rows that cannot come back from a stored or shared stack. */
export const dropUnrestorableRows = <T extends PersistedLayer>(
  layers: T[]
): T[] => layers.filter(isRestorableRow);
