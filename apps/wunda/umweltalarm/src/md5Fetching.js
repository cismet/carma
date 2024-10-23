import Dexie from "dexie";
import Flatbush from "flatbush";
import turfBbox from "@turf/bbox";

export const CACHE_JWT = "--cached--data--";

export const initTables = (prefix, daqKeys) => {
  const db = new Dexie(prefix);
  const schema = {};
  for (const key of daqKeys) {
    schema[key] = "gid";
  }
  schema["daq_meta"] = "++id,name,md5,time";
  schema["anprechp"] = "id";
  schema["zustaendigkeit"] =
    "id,tabelle,referenzfeld,referenz,[tabelle+referenzfeld+referenz]";

  db.version(10).stores(schema);

  return db;
};

export const md5ActionFetchDAQ4Dexie = async (
  prefix,
  apiUrl,
  jwt,
  daqKey,
  db
) => {
  const allObjects = await db.table("daq_meta").get({ name: daqKey });
  let md5InCache = null;

  if (allObjects != null) {
    md5InCache = allObjects.md5;
  }

  console.log("DAQ for " + daqKey);

  let taskParameters = {
    parameters: {
      daqKey,
      md5: md5InCache + (daqKey === "trinkwasserbrunnen" ? "XXX" : "") || "-",
    },
  };

  let fd = new FormData();
  fd.append(
    "taskparams",
    new Blob([JSON.stringify(taskParameters)], {
      type: "application/json",
    })
  );

  if (jwt === CACHE_JWT) {
    const data = "data retrieved";

    //go for result.time after the new version of the action is live
    const time = allObjects.time;
    return new Promise((resolve, reject) => {
      resolve({ data, time });
    });
  } else {
    const response = await fetch(
      apiUrl +
        "/actions/WUNDA_BLAU.dataAquisition/tasks?resultingInstanceType=result",
      {
        method: "POST",
        // method: "GET",
        headers: {
          Authorization: "Bearer " + jwt,
          // "Content-Type": "application/json",
          // Accept: "application/json",
        },
        body: fd,
      }
    );

    if (response.status >= 200 && response.status < 300) {
      const content = await response.json();
      if (content.res) {
        try {
          const result = JSON.parse(content.res);
          let status = result.status;
          let data, time;

          if (status === 200) {
            console.log("DAQ cache miss for " + daqKey);

            data = JSON.parse(result.content);
            time = result.time;
            const newData = {};
            newData["md5"] = result.md5;
            newData["time"] = time;
            newData["name"] = daqKey;
            console.log("new md5: " + newData.md5);

            if (allObjects != null) {
              await db.table("daq_meta").update(allObjects.id, newData);
            } else {
              db.table("daq_meta").add(newData);
            }
            //              console.time("index time"+daqKey)
            if (data && data[0] && data[0].geojson) {
              await indexGeometries(data, daqKey, prefix, db);
            }
            //              console.timeEnd("index time"+daqKey)
          } else if (status === 304) {
            console.log("DAQ cache hit for " + daqKey);
            //go for result.time after the new version of the action is live

            if (allObjects != null) {
              time = allObjects.time;
              data = "data retrieved";
            }
          }

          return new Promise((resolve, reject) => {
            resolve({ data, daqKey, time });
          });
        } catch (e) {
          return new Promise((resolve, reject) => {
            reject({
              status: 500,
              desc: "error when parsing the server result. probably the content has the wrong structure",
              content,
              exception: e,
            });
          });
        }
      } else {
        return new Promise((resolve, reject) => {
          reject({
            status: 500,
            desc: "error when parsing the server result.",
            content,
          });
        });
      }
    } else if (response.status === 401) {
      return new Promise((resolve, reject) => {
        reject({ status: response.status, daqKey, desc: "unauthorized" });
      });
    } else {
      return new Promise((resolve, reject) => {
        reject({ status: response.status, daqKey, desc: "unknown" });
      });
    }
  }
};

export const indexGeometries = async (content, table, prefix, db) => {
  const index = new Flatbush(content.length);
  const tableObject = db.table(table);
  await tableObject.clear();

  const data = [];

  for (const el of content) {
    const geo = getBoundsFromArea(el.geojson);
    const i = index.add(geo[0][1], geo[0][0], geo[1][1], geo[1][0]);
    const newData = {};
    newData["gid"] = i;
    newData["data"] = el;
    data.push(newData);
  }

  await tableObject.bulkPut(data);
  index.finish();

  const allObjects = await db.table("daq_meta").get({ name: table });
  const changes = {};
  changes["pol_index"] = index.data;
  await db.table("daq_meta").update(allObjects.id, changes);
};

export const indexAnsprechpartner = async (content, table, db) => {
  const tableObject = db.table("anprechp");
  await tableObject.clear();

  const data = [];

  for (const el of content) {
    const newData = {};
    newData["id"] = el.id;
    newData["data"] = el;
    data.push(newData);
  }

  await tableObject.bulkPut(data);
};

export const indexAnsprechpartnerZustaendigkeit = async (
  content,
  table,
  db
) => {
  const tableObject = db.table("zustaendigkeit");
  await tableObject.clear();

  const data = [];

  for (const el of content) {
    const newData = {};
    newData["id"] = el.id;
    newData["tabelle"] = el.tabelle;
    newData["referenz"] = el.referenz;
    newData["referenzfeld"] = el.referenzfeld;
    newData["data"] = el;
    data.push(newData);
  }

  await tableObject.bulkPut(data);
};

export const getBoundsFromArea = (area) => {
  const bboxArray = turfBbox(area);
  const corner1 = [bboxArray[1], bboxArray[0]];
  const corner2 = [bboxArray[3], bboxArray[2]];
  const bounds = [corner1, corner2];

  return bounds;
};
