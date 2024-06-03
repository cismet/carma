import { useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import * as L from 'leaflet';
import { AutoComplete, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import AddressLabel from './components/AddressLabel';
import { ModelAsset, OptionItem } from './types';
import Title from './components/Title';
import { gazDataPrefix, sourcesConfig, stopwords } from './config';
import { getGazData, prepareGazData, removeStopwords } from './utils';
import './topicMaps.css';
import {
  builtInGazetteerHitTrigger,
  MapConsumer,
} from './tools/gazetteerHelper';
import { Viewer } from 'cesium';
import { removeMarker } from './tools/cesium3dMarker';

const renderItem = (address) => {
  return {
    key: address.sorter,
    value: address.string,
    label: <AddressLabel address={address} />,
    sData: address,
  };
};

const generateOptions = (results) => {
  return results.map((result, idx) => {
    return renderItem(result.item);
  });
};

const mapDataToSearchResult = (data) => {
  console.log('vvv', data);
  const splittedCategories = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.type;

    if (splittedCategories.hasOwnProperty(catName)) {
      splittedCategories[catName].push(renderItem(address));
    } else {
      splittedCategories[catName] = [renderItem(address)];
    }
  });

  const prepareOptions = Object.keys(splittedCategories).reduce(
    (acc: OptionItem[], item) => {
      const optionItem: OptionItem = {
        label: <Title category={item} />,
        options: splittedCategories[item],
      };

      return [...acc, optionItem];
    },
    []
  );

  return prepareOptions;
};

type SearchGazetterProps = {
  gazData?: any;
  setGazetteerHit: (hit: any) => void;
  gazetteerHit: any;
  mapRef?: L.Map;
  cesiumRef?: Viewer;
  //overlayFeature: any;
  setOverlayFeature: (feature: any) => void;
  //crs?: string;
  //referenceSystem: any;
  //referenceSystemDefinition: any;
  pixelwidth?: number;
  ifShowCategories?: boolean;
  marker3dStyle?: ModelAsset;
};

// TODO adjust the props to be more map framework agnostic, see builtInGazetteerHitTrigger
// TODO get CRS from GezData
export function SearchGazetteer({
  gazData,
  setGazetteerHit,
  gazetteerHit,
  mapRef,
  cesiumRef,
  //overlayFeature,
  //setOverlayFeature,
  pixelwidth = 300,
  marker3dStyle,
  ifShowCategories: standardSearch = false,
}: SearchGazetterProps) {
  const [options, setOptions] = useState([]);
  const [data, setData] = useState([]);

  const [showCategories, setSfStandardSearch] = useState(standardSearch);

  // const _gazetteerHitTrigger = undefined;
  const inputStyle = {
    width: 'calc(100% - 32px)',
    borderRadius: '2px',
  };

  const mapConsumers: MapConsumer[] = [];
  cesiumRef && mapConsumers.push(cesiumRef);
  mapRef && mapConsumers.push(mapRef);

  //console.log('mapConsumers', mapConsumers);

  const internalGazetteerHitTrigger = (hit) => {
    builtInGazetteerHitTrigger(hit, mapConsumers, {
      setGazetteerHit,
      marker3dStyle,
    });
  };

  const [searchResult, setSearchResult] = useState<OptionItem[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState<readonly any[] | null>(
    null
  );
  const [value, setValue] = useState('');
  const [typeaheadPartValue, setTypeaheadPartValue] = useState('');

  const handleSearchAutoComplete = (value) => {
    if (allGazeteerData && allGazeteerData.length > 0) {
      const fuseAddressesOptions = {
        distance: 100,
        useExtendedSearch: true,
        threshold: 0.5,
        keys: ['xSearchData'],
      };
      const fuse = new Fuse(allGazeteerData, fuseAddressesOptions);
      const result = fuse.search(removeStopwords(value, stopwords));
      if (!showCategories) {
        setOptions(generateOptions(result));
      } else {
        const groupedResults = mapDataToSearchResult(result);
        setSearchResult(groupedResults);
      }
      if (result.length > 0 && value !== '') {
        setTypeaheadPartValue(result[0].item.string);
      }
    }
  };

  const handleOnSelect = (option) => {
    console.log('hhh', option);
    internalGazetteerHitTrigger([option.sData]);
    if (option.sData.type === 'bezirke' || option.sData.type === 'quartiere') {
      setGazetteerHit(null);
    } else {
      setGazetteerHit(option.sData);
    }
  };

  useEffect(() => {
    console.log('gazData hook', gazData);
    if (!gazData) {
      console.info('no gazeteerdata defined, fetching gazData', sourcesConfig);
      const setDataCallback = (data) => {
        setData(data);
        setAllGazeteerData(prepareGazData(data, stopwords));
      };
      Array.isArray(sourcesConfig) &&
        getGazData(sourcesConfig, gazDataPrefix, setDataCallback);
    } else {
      setData(gazData);
      setAllGazeteerData(prepareGazData(gazData, stopwords));
    }
  }, [gazData]);

  useEffect(() => {}, [showCategories]);

  const handleShowCategories = (e) => {
    setSfStandardSearch(e.target.checked);
    setOptions([]);
    setSearchResult([]);
    setValue('');
  };

  const handleOnClose = () => {
    console.log('On CLose', null);
    setGazetteerHit(null);
    setValue('');
    setOptions([]);
    setSearchResult([]);
    cesiumRef && removeMarker(cesiumRef);
    //setOverlayFeature(null);
  };

  return (
    <form
      style={{
        //marginTop: '20px',
        width: pixelwidth,
      }}
    >
      <Button icon={<CloseOutlined />} onClick={handleOnClose} />
      {!showCategories ? (
        <>
          <AutoComplete
            options={options}
            style={inputStyle}
            onSearch={(value) => handleSearchAutoComplete(value)}
            onChange={(value) => setValue(value)}
            placeholder="Stadtteil | Adresse | POI ... "
            value={value}
            onSelect={(value, option) => handleOnSelect(option)}
          ></AutoComplete>
          {
            false && (
              <input placeholder="---" value={typeaheadPartValue} disabled />
            ) // TODO maybe render lookahead value on top here as non-editable input or just some text with two spans
          }
        </>
      ) : (
        <AutoComplete
          popupClassName="certain-category-search-dropdown"
          popupMatchSelectWidth={500}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          placeholder="Stadtteil | Adresse | POI"
          options={searchResult}
          onSelect={(value, option) => handleOnSelect(option)}
          value={value}
          onChange={(value) => setValue(value)}
        >
          {/* <Input.Search size="large" placeholder="input here" /> */}
        </AutoComplete>
      )}
      {/* <div style={{ marginLeft: '20px', flexShrink: 0 }}>
    <Checkbox onChange={handleShowCategories} checked={showCategories}>
      <span style={{ fontSize: '14px' }}>Kategorien anzeigen</span>
    </Checkbox>
  </div> */}
    </form>
  );
}

export default SearchGazetteer;
