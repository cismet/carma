export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

export const isSerializedError = (
  value: SerializedError | undefined | null
): value is SerializedError =>
  !!value &&
  typeof value.name === "string" &&
  typeof value.message === "string" &&
  (value.stack === undefined || typeof value.stack === "string");

export const errorToJson = (error: Error | null): SerializedError | null => {
  if (!error) {
    return null;
  }
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
  };
};

export const errorFromJson = (error: SerializedError | null): Error | null => {
  if (!error) {
    return null;
  }
  const restored = new Error(error.message);
  restored.name = error.name;
  if (error.stack) {
    restored.stack = error.stack;
  }
  return restored;
};
