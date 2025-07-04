import objectAssign from "object-assign";
import queryString from "query-string";

import "url-search-params-polyfill";

export function modifyQueryPart(search, modifiedParts) {
  let query = queryString.parse(search);
  let newQuery = objectAssign(query, modifiedParts);
  return (
    "?" +
    queryString.stringify(newQuery, {
      sort: (m, n) => {
        return getOrderOfQueryPart(m) >= getOrderOfQueryPart(n);
      },
    })
  );
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

// export function getQueryObject(search) {
//     let obj = {};
//     if(search) {
//         search.slice(1).split('&').map((item) => {
//         const [ k, v ] = item.split('=');
//         v ? obj[k] === v : null;
//       });
//     }
//     return obj;
// }
// will be replaced through : queryString.parse(search)
