const newBaseUrl = import.meta.env.VITE_WUPP_ASSET_BASEURL + "/geoportal/";

// Wuppertal hosts whose /geoportal/ assets are mirrored on our asset server
const MIRRORED_PREFIXES = [
  "https://www.wuppertal.de/geoportal/",
  "http://www.wuppertal.de/geoportal/",
  "https://geo.wuppertal.de/geoportal/",
  "http://geo.wuppertal.de/geoportal/",
];

export const updateUrl = (url: string) => {
  if (!url) {
    return url;
  }
  return url.replace("https://www.wuppertal.de/geoportal/", newBaseUrl);
};

const getMirrorUrl = (url: string): string | undefined => {
  const prefix = MIRRORED_PREFIXES.find((p) => url.startsWith(p));
  if (!prefix) {
    return undefined;
  }
  return newBaseUrl + url.slice(prefix.length);
};

/**
 * Urls to try in order for an image: the original first, then our mirror
 * if the original lives on a mirrored Wuppertal host.
 */
export const getImageUrlCandidates = (url: string | undefined): string[] => {
  if (!url) {
    return [];
  }
  const mirror = getMirrorUrl(url);
  return mirror && mirror !== url ? [url, mirror] : [url];
};
