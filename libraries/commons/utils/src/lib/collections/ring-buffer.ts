/**
 * Generic fixed-size ring buffer state.
 *
 * Overwrites oldest entries when capacity is reached.
 * Iteration order is always oldest → newest.
 */
export type RingBuffer<T> = {
  readonly capacity: number;
  readonly entries: readonly (T | null)[];
  readonly head: number;
  readonly count: number;
};

const ensurePositiveInteger = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
};

const createEmptyEntries = <T>(capacity: number): readonly (T | null)[] =>
  new Array(capacity).fill(null);

export const createRingBuffer = <T>(capacity: number): RingBuffer<T> => {
  const resolvedCapacity = ensurePositiveInteger(
    capacity,
    "RingBuffer capacity"
  );
  return {
    capacity: resolvedCapacity,
    entries: createEmptyEntries<T>(resolvedCapacity),
    head: 0,
    count: 0,
  };
};

export const pushRingBufferEntry = <T>(
  buffer: RingBuffer<T>,
  entry: T
): RingBuffer<T> => {
  const nextEntries = [...buffer.entries];
  nextEntries[buffer.head] = entry;

  return {
    ...buffer,
    entries: nextEntries,
    head: (buffer.head + 1) % buffer.capacity,
    count: buffer.count < buffer.capacity ? buffer.count + 1 : buffer.count,
  };
};

export const readRingBufferEntries = <T>(
  buffer: RingBuffer<T>
): readonly T[] => {
  const result: T[] = [];
  const start = buffer.count < buffer.capacity ? 0 : buffer.head;

  for (let i = 0; i < buffer.count; i++) {
    const idx = (start + i) % buffer.capacity;
    const ringEntry = buffer.entries[idx];
    if (ringEntry !== null) {
      result.push(ringEntry);
    }
  }

  return result;
};

export const clearRingBuffer = <T>(buffer: RingBuffer<T>): RingBuffer<T> => ({
  ...buffer,
  entries: createEmptyEntries<T>(buffer.capacity),
  head: 0,
  count: 0,
});
