export type DroppedAsset = { file?: File; url?: string };
type Handler = {
  accepts: (asset: DroppedAsset) => boolean;
  import: (asset: DroppedAsset) => Promise<void>;
};
const handlers = new Set<Handler>();
/** Existing drop targets dispatch supported extensions before their own formats. */
export const registerDroppedAssetHandler = (handler: Handler) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};
export const dispatchDroppedAsset = async (
  asset: DroppedAsset
): Promise<boolean> => {
  const handler = [...handlers].find((h) => h.accepts(asset));
  if (!handler) return false;
  await handler.import(asset);
  return true;
};
