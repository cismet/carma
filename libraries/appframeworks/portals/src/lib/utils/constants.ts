import L from "leaflet";
import "proj4leaflet";
import proj4 from "proj4";

export const proj4crs25832def =
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";
export const proj4crs31462def =
  "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs";

const origin25832 = proj4(
  proj4crs25832def,
  // Upper left corner of the tile orign based on the WMTSCapabilities layer BBox
  [0.105946948013, 56.8478734515]
);
const origin31462 = proj4(
  proj4crs31462def,
  // Upper left corner of the tile orign based on the WMTSCapabilities layer BBox
  [0.105946948013, 56.8478734515]
);
const getResolutions = function (startlevel = 0, level) {
  var res = [];
  res[0] = (Math.PI * 2 * 6378137) / 256;
  for (var i = 1; i < level; i++) {
    res[i] = (Math.PI * 2 * 6378137) / 256 / Math.pow(2, i);
  }

  res.splice(0, startlevel);
  return res;
};

// Set resolutions
const resolutions = [
  17471320.7509, 8735660.37545, 4367830.18772, 2183915.09386, 1091957.54693,
  545978.773466, 272989.386733, 136494.693366, 68247.3466832, 34123.6733416,
  17061.8366708, 8530.9183354, 4265.4591677, 2132.72958385, 1066.364792,
  533.182396, 266.591198, 133.295599, 66.6477995, 33.32389975,
];
const resolutions_ = getResolutions(5, 25);

// @ts-expect-error
export const crs25832 = new L.Proj.CRS("EPSG:25832", proj4crs25832def, {
  origin: [origin25832[0], origin25832[1]],
  // resolutions: resolutions.map(function (value) {
  //   return value * 0.00028;
  // }),
  resolutions: resolutions_,
});

// @ts-expect-error
export const crs31462 = new L.Proj.CRS("EPSG:31462", proj4crs31462def, {
  origin: [origin31462[0], origin31462[1]],
  // resolutions: resolutions.map(function (value) {
  //   return value * 0.00028;
  // }),
  resolutions: resolutions_,
});

export const proj4crs4326def = "+proj=longlat +datum=WGS84 +no_defs";
export const proj4crs3857def =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

export const crs4326 = L.CRS.EPSG4326;

export const crs3857 = L.CRS.EPSG3857;
// export const crs3857 = new L.Proj.CRS("EPSG:3857", proj4crs3857def, {
//   origin: [origin[0], origin[1]],
//   resolutions: resolutions.map(function (value) {
//     return value * 0.00028;
//   }),
// });

export const AUTO_FIT_MODE_STRICT = "MAPPING/AUTO_FIT_MODE_STRICT";
export const AUTO_FIT_MODE_NO_ZOOM_IN = "MAPPING/AUTO_FIT_MODE_NO_ZOOM_IN";

export const projectionData = {
  "25832": {
    def: proj4crs25832def,
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
  },
  "4326": {
    def: proj4crs4326def,
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::4326",
      },
    },
  },
  "3857": {
    def: proj4crs3857def,
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::3857",
      },
    },
  },
  "31462": {
    def: proj4crs31462def,
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::4326",
      },
    },
  },
};
