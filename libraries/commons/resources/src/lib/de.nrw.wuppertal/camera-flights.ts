import cameraCorridors from "./wuppertal-camera-corridors.json";

/** Source-coordinate paths; capture/derivation and provenance live beside the data. */
export const WUPPERTAL_CAMERA_CORRIDORS = cameraCorridors;

/** Geographic fixtures, not engine objects. Heights are sampled from DGM at runtime.
 * Rail: OSM way 37195413, © OpenStreetMap contributors (ODbL).
 * Bank: simplified Barmen north bank from basemap.de Gewaesserflaeche,
 * captured 2026-09-13; © BKG / GeoBasis-DE. No surveyed track elevation.
 */
export const WUPPERTAL_CAMERA_FLIGHTS = {
  schwebebahn: {
    label: "Schwebebahn · Barmen",
    coordinates: [
      [7.1903214, 51.2672697],
      [7.1932938, 51.2684096],
      [7.1958886, 51.269653],
      [7.1973932, 51.2696399],
      [7.1999909, 51.2695262],
      [7.2029389, 51.2706166],
      [7.2054892, 51.2707977],
      [7.2065409, 51.2719472],
      [7.2076864, 51.2731602],
      [7.2108367, 51.2737768],
      [7.2137434, 51.2733118],
    ],
    aboveGround: 113,
    note: "100 m above assumed track (DGM + 13 m); not surveyed rail height.",
    duration: 180,
    fov: [60, 50, 60],
  },
  wupper: {
    label: "Wupper bank → HKW chimney",
    coordinates: [
      [7.1938, 51.268761224432886],
      [7.193987667560577, 51.26883950283133],
      [7.194438278675079, 51.26902745745076],
      [7.194524109363556, 51.269071089663214],
      [7.194615304470062, 51.26913150342739],
      [7.1947842836380005, 51.269274146722154],
      [7.195130288600922, 51.269445318091414],
      [7.195350229740143, 51.26953593796995],
      [7.195811569690704, 51.269712142777735],
      [7.195948362350464, 51.269757452476256],
      [7.196071743965149, 51.26979101518711],
      [7.1962085366249084, 51.26981618720413],
      [7.1963560581207275, 51.26983632480781],
      [7.196471393108368, 51.26984639360634],
      [7.19653844833374, 51.26985142800481],
      [7.196726202964783, 51.269856462402714],
      [7.196967601776123, 51.26984303734042],
      [7.197367250919342, 51.269769199427856],
      [7.19791442155838, 51.26967186745267],
      [7.198220193386078, 51.26961648882306],
      [7.1985045075416565, 51.26956950084258],
      [7.198772728443146, 51.26954097240241],
      [7.199059724807739, 51.269527547247975],
      [7.199207246303558, 51.26952922539249],
      [7.199368178844452, 51.269539294258294],
      [7.199738323688507, 51.2695862822697],
      [7.199998497962952, 51.26962991395152],
      [7.200113832950592, 51.26965172977691],
      [7.200239896774292, 51.26968361442613],
      [7.20029890537262, 51.26970878650201],
      [7.200730741024017, 51.269926943915266],
      [7.201991379261017, 51.27048072346679],
      [7.202, 51.27048399226516],
    ],
    aboveGround: 180,
    note: "Barmen riverbank spline, DGM + 180 m; long-range view towards HKW Zoo.",
    duration: 180,
    fov: [30, 12, 24, 8, 30],
  },
} as const;

/** Same measured landmark as the light stress scene, fixture points 7 and 6. */
export const WUPPERTAL_HKW_CHIMNEY = {
  longitude: 7.11869664699761,
  latitude: 51.24837502855188,
  footHeight: 139.81504433381122,
  topHeight: 338.0485597810839,
} as const;
