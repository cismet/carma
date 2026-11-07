/**
 * A geoportal page with the relay code it listens to. The geoportal reads its
 * parameters from the hash only, so `relay` goes there.
 */
export const relayLinkFor = (url: string, relayCode: string): string => {
  const hash = url.slice(url.indexOf("#") + 1);
  return `${url}${hash.includes("?") ? "&" : "?"}relay=${encodeURIComponent(
    relayCode
  )}`;
};
