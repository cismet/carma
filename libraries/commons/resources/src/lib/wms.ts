export const DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS = {
    transparent: true,
    format: "image/png",
  };
  

  export type WMSLayerDetails = { id: string; name: string; url: string };

  export type WMSLayerMap = {
    [key: string]: WMSLayerDetails;
  };
  