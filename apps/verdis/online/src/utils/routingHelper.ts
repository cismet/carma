// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import "url-search-params-polyfill";
import queryString from "query-string";

export function modifyQueryPart(search, modifiedParts) {
  let original = new URLSearchParams(search);
  let pNames = Object.getOwnPropertyNames(modifiedParts);
  for (let n of pNames) {
    if (original.has(n)) {
      original.set(n, modifiedParts[n]);
    } else {
      original.append(n, modifiedParts[n]);
    }
  }
  return "?" + original.toString();
}

export function changeKassenzeichenInLocation(location, kasznr) {
  let withoutKassz = location.pathname.replace(/\d+$/, "");
  let lastSlash = withoutKassz.lastIndexOf("/");
  let out;
  if (lastSlash + 1 === withoutKassz.length) {
    out = withoutKassz + kasznr + location.search;
  } else {
    out = withoutKassz + "/" + kasznr + location.search;
  }
  return out;
}

export function removeQueryPart(search, partTobeRemoved) {
  let query = queryString.parse(search);
  delete query[partTobeRemoved];
  return (
    "?" +
    queryString.stringify(query, {
      sort: (m, n) => {
        return getOrderOfQueryPart(m) >= getOrderOfQueryPart(n);
      },
    })
  );
}

function getOrderOfQueryPart(part) {
  const order = ["lat", "lng", "zoom"];
  let pos = order.indexOf(part);
  if (pos === -1) {
    return 1000000;
  } else {
    return pos;
  }
}
