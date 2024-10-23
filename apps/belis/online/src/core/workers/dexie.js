import { getDocs } from '../helper/featureHelper';
import { db } from '../indexeddb/dexiedb';
import Pako from 'pako';
import { Buffer } from 'buffer';

export async function putZArray(
  zip,
  objectstorename,
  progressListener = () => {}
) {
  let zippedData = Uint8Array.from(atob(zip), (c) => c.charCodeAt(0));
  let unpackedString = Pako.inflate(zippedData, { to: 'string' });
  zippedData = undefined;
  // console.log(`logGQL:: Result (putZArray):`, unpackedString);
  const result = JSON.parse(unpackedString);
  unpackedString = undefined;
  const inputArray = result.data[objectstorename];
  progressListener({ target: inputArray.length, objectstorename });
  return await putArray(inputArray, objectstorename);
}

export async function putChunkedZArray(
  targetLength,
  countElements,
  zip,
  objectstorename,
  progressListener = () => {}
) {
  //the next line fixes the buffer is not defined error. See https://github.com/remix-run/remix/issues/2248#issuecomment-1239022303
  // window.Buffer = window.Buffer || require("buffer").Buffer;
  // let Buffer = require("buffer").Buffer;
  let zippedData = Uint8Array.from(
    Buffer.from(zip, 'base64').toString('binary'), //replacement for atob(zip)
    (c) => c.charCodeAt(0)
  );
  let unpackedString = Pako.inflate(zippedData, { to: 'string' });
  zippedData = undefined;
  const results = JSON.parse(unpackedString);
  unpackedString = undefined;
  for (const item of results) {
    //removes all undefined values from the object
    cleanUpObject(item);
  }
  const chunkLength = results.length;
  progressListener({ target: targetLength, objectstorename });
  progressListener({
    progress: countElements + chunkLength / 2,
    objectstorename,
  });
  await db[objectstorename].bulkPut(results);
  progressListener({ progress: countElements + chunkLength, objectstorename });
  return countElements + chunkLength;
}

export async function putArray(inputArray, objectstorename) {
  try {
    let i,
      j,
      chunk = inputArray.length / 20,
      counter = 0;
    if (chunk < 200) {
      chunk = inputArray.length;
    }
    for (i = 0, j = inputArray.length; i < j; i += chunk) {
      const data = inputArray.slice(i, i + chunk);
      const items = [];
      for (const item of data) {
        //removes all undefined values from the object
        cleanUpObject(item);
        items.push(item);
        inputArray[counter] = undefined;
        delete inputArray[counter];
        counter++;
      }
      // postMessage({ progress: counter - chunk / 2, objectstorename });
      await db[objectstorename].bulkPut(items);
      // postMessage({ progress: counter, objectstorename });
    }

    return true;
  } catch (err) {
    console.log('worker error in putArray', err);
  }
}

export async function deleteDB() {
  try {
    // db.tables.forEach(function (table) {
    //   db[table.name].clear();
    // });
    db.delete();
    // initialize(db);
  } catch (err) {
    console.log('worker error in deleteDB', err);
  }
}

export async function updateSingleCacheItems(updates) {
  if (updates) {
    for (const key of Object.keys(updates)) {
      if (updates[key] && updates[key].length > 0) {
        await db[key].bulkPut(updates[key]);
      }
    }
  }
}

export async function put(input, objectstorename) {
  try {
    return await await db[objectstorename].put(input);
  } catch (err) {
    console.log('worker error in add', err);
  }
}

export async function getCount(objectStore) {
  try {
    return await db[objectStore].count();
  } catch (err) {
    console.log('worker error', err);
  }
}

export async function getAll(objectStore) {
  try {
    return await db[objectStore].toArray();
  } catch (err) {
    console.log('worker error', err);
  }
}

export async function clear(objectStore) {
  try {
    await db[objectStore].clear();
  } catch (err) {
    console.log('worker error', err);
  }
}

export async function get(id, objectStore) {
  try {
    return await db[objectStore].get(id);
  } catch (err) {
    console.log('worker error in get', err);
  }
}

// This function named `cleanUpObject` takes an object as an argument and
// recursively removes any nested keys with a value of null or undefined, or an
// empty array. The function does not modify the original object, but rather it
// modifies the object passed in by reference.

// The function uses `Object.keys()` method to iterate over all the keys of the
// object, and checks the type of each key's value. If the value is an object and
// not an array, it is recursively passed into the same function for further
// cleanup. If the value is an empty array, the key is deleted. If the value is
// null or undefined, the key is also deleted.

// This function is useful for cleaning up an object with potentially nested
// keys, where some of the values may be null, undefined, or empty arrays.
// However, it is important to use this function with caution, as it modifies
// the original object passed in by reference.
const cleanUpObject = (obj) => {
  Object.keys(obj).forEach((key) => {
    if (
      obj[key] &&
      typeof obj[key] === 'object' &&
      Array.isArray(obj[key]) === false
    ) {
      cleanUpObject(obj[key]); // recurse
    } else if (
      obj[key] &&
      typeof obj[key] === 'object' &&
      Array.isArray(obj[key]) === true &&
      obj[key].length === 0
    ) {
      delete obj[key]; // delete
    } else if (obj[key] == null) {
      delete obj[key]; // delete
    }
  });
};

export const getFeaturesForHits = async (points, resultIds, filter) => {
  const featureCollection = [];

  const tablenames = new Set();

  for (const id of resultIds) {
    const hit = points[id];
    tablenames.add(hit.tablename);
    const featureObject = await db[hit.tablename].get(hit.oid);

    if (featureObject) {
      if ((filter[hit.tablename] || {}).enabled === true) {
        let addFeature;
        if (hit.tablename === 'tdta_standort_mast') {
          if (featureObject === undefined) {
            addFeature = false;
          } else {
            addFeature = true;
          }
        } else {
          addFeature = true;
        }

        if (addFeature === true) {
          // let d = new Date().getTime();
          const feature = {
            text: '-',
            type: 'Feature',
            selected: false,
            featuretype: hit.tablename,
            id: hit.tablename,
            geometry: {
              type: 'Point',
              coordinates: [hit.x, hit.y],
            },
            crs: {
              type: 'name',
              properties: {
                name: 'urn:ogc:def:crs:EPSG::25832',
              },
            },
            properties: {},
          };

          feature.properties = featureObject; //getPropertiesForFeature(feature);
          feature.id = feature.id + '-' + featureObject.id;
          feature.properties.docs = getDocs(feature);
          featureCollection.push(feature);
        }
      }
    } else {
      if (hit.tablename !== 'tdta_standort_mast') {
        console.log('could not find ' + hit.tablename + '.' + hit.oid);
      }
    }
  }

  return featureCollection;
};
