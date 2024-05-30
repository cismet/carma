import { useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import { AutoComplete, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { builtInGazetteerHitTrigger } from 'react-cismap/tools/gazetteerHelper';
import AddressLabel from './components/AddressLabel';
import { OptionItem } from './types';
import Title from './components/Title';
import { gazDataPrefix, sourcesConfig, stopwords } from './config';
import { getGazData, prepareGazData, removeStopwords } from './utils';
import 'react-cismap/topicMaps.css';


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

type SearchComponentProps = {
  gazData?: any;
  setGazetteerHit: (hit: any) => void;
  gazetteerHit: any;
  //mapRef: any;
  overlayFeature: any;
  setOverlayFeature: (feature: any) => void;
  referenceSystem: any;
  referenceSystemDefinition: any;
  pixelwidth?: number;
  ifShowCategories?: boolean;
};

function SearchComponent({
  gazData,
  setGazetteerHit,
  gazetteerHit,
  //mapRef,
  overlayFeature,
  setOverlayFeature,
  referenceSystem,
  referenceSystemDefinition,
  pixelwidth = 300,
  ifShowCategories: standardSearch = false,
}: SearchComponentProps) {
  const [options, setOptions] = useState([]);
  const [data, setData] = useState([]);

  const [showCategories, setSfStandardSearch] = useState(standardSearch);

  const _gazetteerHitTrigger = undefined;
  const inputStyle = {
    width: 'calc(100% - 32px)',
    borderRadius: '2px',
  };

  const internalGazetteerHitTrigger = (hit) => {
    builtInGazetteerHitTrigger(
      hit,
      //mapRef.current.leafletMap.leafletElement,
      referenceSystem,
      referenceSystemDefinition,
      setGazetteerHit,
      setOverlayFeature,
      _gazetteerHitTrigger
    );
  };

  const [searchResult, setSearchResult] = useState<OptionItem[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState<readonly any[] | null>(
    null
  );
  const [value, setValue] = useState('');

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
    console.log('bbb', gazData);
    if (!gazData) {
      const setDataCallback = (data) => {
        setData(data);
        setAllGazeteerData(prepareGazData(data, stopwords));
      };
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

  return (
    <div
      style={{
        marginTop: '20px',
        width: pixelwidth,
      }}
    >
      <Button
        icon={<CloseOutlined />}
        style={{ borderRadius: '4px' }}
        onClick={() => {
          setGazetteerHit(null);
          setValue('');
          setOptions([]);
          setSearchResult([]);
          setOverlayFeature(null);
        }}
      />
      {!showCategories ? (
        <AutoComplete
          options={options}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          onChange={(value) => setValue(value)}
          placeholder="Stadtteil | Adresse | POI"
          value={value}
          onSelect={(value, option) => handleOnSelect(option)}
        />
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
    </div>
  );
}

export default SearchComponent;
