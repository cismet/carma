/** A uuid for an annotation: the platform's, or a time-and-random fallback. */
export const createAnnotationUuid = (): string => {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`;
};
