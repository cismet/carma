const newBaseUrl = import.meta.env.VITE_WUPP_ASSET_BASEURL + "/geoportal/";

export const updateUrl = (url: string) => {
  if (!url) {
    return url;
  }
  return url
    .replace("https://geo.wuppertal.de/geoportal/", newBaseUrl)
    .replace("https://www.wuppertal.de/geoportal/", newBaseUrl);
};
