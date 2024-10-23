import parse from 'wellknown';
import check from 'check-types';
import { GEOM_FIELD } from '../constants/cids';

export function getGeoJsonFeatureFromCidsObject(
  input,
  selector,
  propCreator = (input) => {}
) {
  if (check.array(input)) {
    let collection: any = [];
    input.forEach(function (cidsObject) {
      collection.push(
        getGeoJsonFeatureFromCidsGeom(
          deepAccessUsingString(cidsObject, selector),
          propCreator(cidsObject)
        )
      );
    });
    return collection;
  } else if (check.object(input)) {
    return getGeoJsonFeatureFromCidsGeom(
      deepAccessUsingString(input, selector),
      propCreator(input)
    );
  } else {
    throw new Error(
      'getGeoJsonFromCidsObject has to be called either with an cidsObject or an Array of cidsObjects'
    );
  }
}

export function getGeoJsonFeatureFromCidsGeom(geom, properties) {
  let gj_geometry = parse(geom[GEOM_FIELD]);
  //need to move the crs object to the top level as requested in the standard (and leaflet)
  let crs = gj_geometry.crs;
  delete gj_geometry.crs;
  return {
    type: 'Feature',
    id: properties.id || JSON.stringify(properties), //better hash this value
    geometry: gj_geometry,
    crs: crs,
    properties: properties,
  };
}

function deepAccessUsingString(obj, key) {
  return key.split('.').reduce((nestedObject, key) => {
    if (nestedObject && key in nestedObject) {
      return nestedObject[key];
    }
    return undefined;
  }, obj);
}

export default {};
