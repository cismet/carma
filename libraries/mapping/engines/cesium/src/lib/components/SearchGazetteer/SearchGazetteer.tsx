/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO gazetteer will be replaced anyway
import { ChangeEvent, useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import L from 'leaflet';
import { AutoComplete, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import AddressLabel from './components/AddressLabel';
import { ModelAsset, Option, OptionItem } from './types';
import Title from './components/Title';
import { gazDataPrefix, sourcesConfig, stopwords } from './config';
import { getGazData, prepareGazData, removeStopwords } from './utils';
import './topicMaps.css';
import {
  builtInGazetteerHitTrigger,
  INVERTED_SELECTED_POLYGON_ID,
  MapConsumer,
  SELECTED_POLYGON_ID,
} from './tools/gazetteerHelper';
import { Viewer } from 'cesium';
import { removeMarker } from './tools/cesium3dMarker';
import { removeGroundPrimitiveById } from './tools/cesium';

const renderItem = (address: any) => {
  return {
    key: address.sorter,
    value: address.string,
    label: <AddressLabel address={address} />,
    sData: address,
  };
};

const generateOptions = (results: any[]) => {
  return results.map((result: any) => {
    return renderItem(result.item);
  });
};

const mapDataToSearchResult = (data: any[]) => {
  const splittedCategories: Record<string, Option[]> = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.type;

    if (Object.prototype.hasOwnProperty.call(splittedCategories, catName)) {
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

type SearchGazetteerProps = {
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
}: SearchGazetteerProps) {
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

  const internalGazetteerHitTrigger = (hit: any) => {
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

  const handleSearchAutoComplete = (value: any) => {
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
        setOptions(generateOptions(result) as any);
      } else {
        const groupedResults = mapDataToSearchResult(result);
        setSearchResult(groupedResults);
      }
      if (result.length > 0 && value !== '') {
        setTypeaheadPartValue(result[0].item.string);
      }
    }
  };

  const handleOnSelect = (option: any) => {
    console.log('Handle Selected Option', option);
    internalGazetteerHitTrigger([option.sData]);
    if (option.sData.type === 'bezirke' || option.sData.type === 'quartiere') {
      setGazetteerHit(null);
    } else {
      setGazetteerHit(option.sData);
    }
  };

  useEffect(() => {
    console.log('HOOK: gazData', gazData);
    if (!gazData) {
      console.info('no gazeteerdata defined, fetching gazData', sourcesConfig);
      const setDataCallback = (data: any) => {
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

  const handleShowCategories = (e: ChangeEvent<HTMLInputElement>) => {
    setSfStandardSearch(e.target.checked);
    setOptions([]);
    setSearchResult([]);
    setValue('');
  };

  const handleOnClose = () => {
    //console.log('On CLose', null);
    setGazetteerHit(null);
    setValue('');
    setOptions([]);
    setSearchResult([]);
    if (cesiumRef) {
      removeMarker(cesiumRef);
      cesiumRef.entities.removeById(SELECTED_POLYGON_ID);
      //cesiumRef.entities.removeById(INVERTED_SELECTED_POLYGON_ID);
      removeGroundPrimitiveById(cesiumRef, INVERTED_SELECTED_POLYGON_ID);
    }
    //setOverlayFeature(null);
  };

  return (
    <form
      style={{
        display: 'flex',
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
            popupMatchSelectWidth={500}
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
