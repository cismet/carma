export type WMSLayerDetails = { id: string; name: string; url: string };

export type WMSLayerMap = {
  [key: string]: WMSLayerDetails;
};
