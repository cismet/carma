import { Matrix4, PrimitiveCollection } from "../../cesium";

type PrimitiveGroupEntry = {
  primitive: unknown;
  remove: () => void;
  setModelMatrix: (modelMatrix: Matrix4) => void;
  setVisible: (visible: boolean) => void;
};

export type PrimitiveGroupItemOptions<T> = {
  addToCollection?: boolean;
  remove?: (primitive: T) => void;
  setModelMatrix?: (primitive: T, modelMatrix: Matrix4) => void;
  setVisible?: (primitive: T, visible: boolean) => void;
};

export type PrimitiveGroup = {
  add: <T>(primitive: T, options?: PrimitiveGroupItemOptions<T>) => T;
  remove: (primitive: unknown) => void;
  setModelMatrix: (modelMatrix: Matrix4) => void;
  setVisible: (visible: boolean) => void;
  clear: () => void;
  destroy: () => void;
  readonly size: number;
};

const setPrimitiveModelMatrixIfPresent = (
  primitive: unknown,
  modelMatrix: Matrix4
) => {
  if (!primitive || typeof primitive !== "object") return;
  if (!("modelMatrix" in primitive)) return;
  (primitive as { modelMatrix: Matrix4 }).modelMatrix = Matrix4.clone(
    modelMatrix,
    new Matrix4()
  );
};

const setPrimitiveVisibleIfPresent = (primitive: unknown, visible: boolean) => {
  if (!primitive || typeof primitive !== "object") return;
  if (!("show" in primitive)) return;
  (primitive as { show: boolean }).show = visible;
};

const safeCall = (action: () => void) => {
  try {
    action();
  } catch {
    // Ignore teardown races and already-destroyed primitives.
  }
};

export const createPrimitiveGroup = (
  collection: PrimitiveCollection
): PrimitiveGroup => {
  const entries: PrimitiveGroupEntry[] = [];
  let destroyed = false;
  let visible = true;
  let modelMatrix = Matrix4.clone(Matrix4.IDENTITY, new Matrix4());

  const setEntryModelMatrix = (entry: PrimitiveGroupEntry) => {
    entry.setModelMatrix(modelMatrix);
  };

  const setEntryVisible = (entry: PrimitiveGroupEntry) => {
    entry.setVisible(visible);
  };

  const removeEntry = (entry: PrimitiveGroupEntry) => {
    safeCall(entry.remove);
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  };

  const add = <T>(primitive: T, options?: PrimitiveGroupItemOptions<T>): T => {
    if (destroyed) return primitive;

    const addToCollection = options?.addToCollection ?? true;
    if (addToCollection) {
      collection.add(primitive as unknown as object);
    }

    const removeAction =
      options?.remove ??
      ((value: T) => {
        collection.remove(value as unknown as object);
      });
    const setModelMatrixAction =
      options?.setModelMatrix ??
      ((value: T, nextModelMatrix: Matrix4) => {
        setPrimitiveModelMatrixIfPresent(value, nextModelMatrix);
      });
    const setVisibleAction =
      options?.setVisible ??
      ((value: T, nextVisible: boolean) => {
        setPrimitiveVisibleIfPresent(value, nextVisible);
      });

    const entry: PrimitiveGroupEntry = {
      primitive,
      remove: () => removeAction(primitive),
      setModelMatrix: (nextModelMatrix) =>
        setModelMatrixAction(primitive, nextModelMatrix),
      setVisible: (nextVisible) => setVisibleAction(primitive, nextVisible),
    };

    entries.push(entry);
    setEntryModelMatrix(entry);
    setEntryVisible(entry);
    return primitive;
  };

  const remove = (primitive: unknown) => {
    const entry = entries.find(
      (candidate) => candidate.primitive === primitive
    );
    if (!entry) return;
    removeEntry(entry);
  };

  const setModelMatrix = (nextModelMatrix: Matrix4) => {
    modelMatrix = Matrix4.clone(nextModelMatrix, new Matrix4());
    entries.forEach(setEntryModelMatrix);
  };

  const setVisible = (nextVisible: boolean) => {
    visible = nextVisible;
    entries.forEach(setEntryVisible);
  };

  const clear = () => {
    [...entries].forEach(removeEntry);
  };

  const destroy = () => {
    if (destroyed) return;
    clear();
    destroyed = true;
  };

  return {
    add,
    remove,
    setModelMatrix,
    setVisible,
    clear,
    destroy,
    get size() {
      return entries.length;
    },
  };
};
