export const createUniqueRuntimeId = (prefix: string): string =>
  `${prefix}-${globalThis.crypto.randomUUID()}`;
