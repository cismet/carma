//import 'bootstrap/dist/css/bootstrap.min.css';

// eslint disable

import { useTweakpaneCtx } from '@carma-commons/debug';
import CustomCesiumWidget from '../../../components/CustomCesiumWidget';
import { useEffect, useState } from 'react';
import { LatLngRecord } from '../../../../';
import { Checkbox, Radio, Select } from 'antd';
import { FOOTPRINT_GEOJSON_SOURCES } from '../../../config/dataSources.config';

const { Option } = Select;

type Poi = {
  label: string;
  position: PositionRecord;
  range?: number;
  clipBy?: {
    radius?: number;
    polygon?: LatLngRecord[];
  };
};

const POI = {
  TOELLETURM: {
    label: 'Toelleturm',
    position: { longitude: 7.201578, latitude: 51.256565, height: 335 + 10 },
    range: 30,
    clipBy: {
      radius: 15,
    },
  },
  RATHAUS: {
    label: 'Rathaus',
    position: { longitude: 7.19993, latitude: 51.27225, height: 170 },
    range: 150,
    clipBy: {
      radius: 120,
    },
  },
  KUGELGAS: {
    label: 'Kugelgasbehälter',
    position: { longitude: 7.08586, latitude: 51.24584, height: 190 },
    range: 60,
    clipBy: {
      radius: 30,
    },
  },
  STADION: {
    label: 'Stadion am Zoo',
    position: { longitude: 7.1049, latitude: 51.23916, height: 140 },
    range: 185,
    clipBy: {
      radius: 140,
    },
  },
  HBF: {
    label: 'Hauptbahnhof',
    position: { longitude: 7.1485164, latitude: 51.2559275, height: 150 },
    range: 80,
    clipBy: {
      radius: 60,
    },
  },
};

const options = Object.entries(POI).reduce((acc, [key, value]) => {
  acc[value.label] = key;
  return acc;
}, {});

type PositionRecord = LatLngRecord & { height: number };

function View() {
  const [poiKey, setPoiKey] = useState<string>('TOELLETURM');
  const [orthographic, setOrthographic] = useState<boolean>(true);

  const [poi, setPoi] = useState<Poi | null>(POI[poiKey]);
  const [debug, setDebug] = useState<boolean>(false);
  const [animate, setAnimate] = useState<boolean>(false);

  useTweakpaneCtx(
    {
      title: 'MiniView CesiumWidget',
    },
    {
      get poi() {
        return poiKey;
      },
      set poi(v) {
        setPoiKey(v);
        setPoi(POI[v]);
      },

      get debug() {
        return debug;
      },
      set debug(value: boolean) {
        setDebug(value);
      },
      get orthographic() {
        return orthographic;
      },
      set orthographic(value: boolean) {
        setOrthographic(value);
      },
      get animate() {
        return animate;
      },
      set animate(value: boolean) {
        setAnimate(value);
      },
    },

    [
      {
        name: 'poi',
        options,
      },
      { name: 'debug', type: 'boolean' },
      { name: 'orthographic', type: 'boolean' },
      { name: 'animate', type: 'boolean' },
    ]
  );

  console.log('RENDER Widget Test View', { poi, debug });

  const ViewToggle = () => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Radio.Group
        value={orthographic ? 'orthographic' : 'perspective'}
        onChange={(e) => setOrthographic(e.target.value === 'orthographic')}
      >
        <Radio.Button value="perspective">Perspektivisch</Radio.Button>
        <Radio.Button value="orthographic">Orthografisch</Radio.Button>
      </Radio.Group>
      <hr />
      <Checkbox
        checked={animate}
        onChange={(e) => setAnimate(e.target.checked)}
        style={{ marginLeft: '20px' }}
      >
        Animation
      </Checkbox>
    </div>
  );

  const LocationToggle = () => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Radio.Group
        value={poiKey}
        onChange={(e) => {
          setPoiKey(e.target.value);
          setPoi(POI[e.target.value]);
        }}
      >
        {Object.entries(options).map(([key, value]) => (
          <Radio.Button key={value as string} value={value}>
            {key}
          </Radio.Button>
        ))}
      </Radio.Group>
    </div>
  );

  const GeoJSONDropdown = () => {
    const [features, setFeatures] = useState([]);
    const key = FOOTPRINT_GEOJSON_SOURCES.VORONOI.idProperty;
    const labelProperty = 'GEB_NAME';

    useEffect(() => {
      fetch(FOOTPRINT_GEOJSON_SOURCES.VORONOI.url)
        .then((response) => response.json())
        .then((data) => {
          //console.log('data', data);
          const namedFeatures = data.features.filter((a) => {
            const test = a.properties[labelProperty] !== null;
            return test;
          });
          //console.log('namedFeatures', namedFeatures);
          const sortedFeatures = namedFeatures.sort((a, b) =>
            a.properties[labelProperty].localeCompare(
              b.properties[labelProperty]
            )
          );
          setFeatures(sortedFeatures);
        });
    }, []);

    console.log('RENDER GeoJSONDropdown', features);

    return (
      <Select
        style={{ width: 400 }}
        onSelect={(value) => {
          const feature = features.find(
            (a: GeoJSON.Feature) => a.properties![key] === value
          ) as unknown as GeoJSON.Feature;
          if (feature && feature.geometry.type === 'MultiPolygon') {
            const ring = Object.freeze(feature.geometry.coordinates[0][0]);
            const [longitude, latitude, height] = ring[0];

            const latitudeSort = ring
              .map(([_, lat]) => lat)
              .sort((a, b) => a - b);
            const longitudeSort = ring
              .map(([lng]) => lng)
              .sort((a, b) => a - b);

            const latMin = latitudeSort[0];
            const lngMin = longitudeSort[0];
            const latMax = latitudeSort[latitudeSort.length - 1];
            const lngMax = longitudeSort[longitudeSort.length - 1];

            const latCenter = (latMin + latMax) / 2;
            const lngCenter = (lngMin + lngMax) / 2;

            const position = {
              longitude: lngCenter ?? longitude,
              latitude: latCenter ?? latitude,
              height: height ?? 170,
            };
            feature &&
              setPoi({
                label: feature?.properties![labelProperty],
                position,
                range: 50,
                clipBy: {
                  //radius: 100,
                  polygon: feature!.geometry!.coordinates[0][0].map(
                    ([longitude, latitude]) => ({ longitude, latitude })
                  ),
                },
              });
          }
        }}
      >
        {features &&
          features.map((feature: GeoJSON.Feature) => (
            <Option
              key={feature!.properties![key]}
              value={feature!.properties![key]}
            >
              {`${feature!.properties![labelProperty]} - ${
                feature!.properties!['STRNAME']
              } ${feature!.properties!['HAUSNR']}`}
            </Option>
          ))}
      </Select>
    );
  };

  return (
    poi && (
      <div
        style={{
          paddingTop: '100px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '50px',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '10px',
          }}
        >
          <CustomCesiumWidget
            position={poi.position}
            range={poi.range}
            clip={false}
            clipRadius={poi.clipBy?.radius}
            clipPolygon={poi.clipBy?.polygon}
            orthographic={orthographic}
            pixelSize={{ width: 512, height: 512 }}
            debug={debug}
            animate={animate}
          >
            {poi.label} {orthographic ? 'orthografisch' : 'perspektive'}
          </CustomCesiumWidget>
          <CustomCesiumWidget
            position={poi.position}
            range={poi.range}
            clip={true}
            clipRadius={poi.clipBy?.radius}
            clipPolygon={poi.clipBy?.polygon}
            orthographic={orthographic}
            pixelSize={{ width: 512, height: 512 }}
            debug={debug}
            animate={animate}
          >
            {poi.label} {orthographic ? 'orthografisch' : 'perspektive'} clipped
          </CustomCesiumWidget>
        </div>
        <ViewToggle />
        <LocationToggle />
        Benannte Gebäude aus Sample-GeoJson mit gebufferten Umrissen:
        <GeoJSONDropdown />
        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'center',
            justifyItems: 'flex-start',
            flexGrow: 1,
            marginBottom: '10px',
          }}
        ></div>
      </div>
    )
  );
}

export default View;
