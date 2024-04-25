import { useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import { AutoComplete, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { builtInGazetteerHitTrigger } from 'react-cismap/tools/gazetteerHelper';

const renderTitle = (title) => {
  return <span>{title}</span>;
};

const renderItem = (address) => {
  const addressLabel = buildAddressWithIconUI(address);
  return {
    key: address.sorter,
    value: address.string,
    label: addressLabel,
  };
};

function buildAddressWithIconUI(addresObj) {
  let icon;
  if (addresObj.glyph === 'pie-chart') {
    icon = 'chart-pie';
  } else {
    icon = addresObj.glyph;
  }
  const streetLabel = (
    <div>
      <span>
        <i className={icon && 'fas ' + 'fa-' + icon}></i>
        {'  '}
      </span>
      <span>{addresObj.string}</span>
    </div>
  );

  return streetLabel;
}

const generateOptions = (results) => {
  return results.map((result, idx) => {
    const streetLabel = buildAddressWithIconUI(result.item);
    return {
      key: result.item.sorter,
      label: <div>{streetLabel}</div>,
      value: result.item?.string,
      sData: result.item,
    };
  });
};

const mapDataToSearchResult = (data) => {
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

  const prepareOptions = [];

  Object.keys(splittedCategories).forEach((item) => {
    let optionItem = {};

    if (!optionItem.hasOwnProperty(item)) {
      optionItem.label = renderTitle(item);
      optionItem.options = splittedCategories[item];
    }

    prepareOptions.push(optionItem);
  });

  return prepareOptions;
};

const preps = [
  'an',
  'auf',
  'hinter',
  'neben',
  'über',
  'unter',
  'vor',
  'zwischen',
  'durch',
  'für',
  'gegen',
  'ohne',
  'um',
  'mit',
  'bei',
  'nach',
  'in',
  'von',
  'zu',
  'aus',
  'bis',
  'seit',
  'anstatt',
  'außerhalb',
  'innerhalb',
];
const articles = ['der', 'die', 'das', 'den', 'dem', 'des'];
const stopwords = [...preps, ...articles];

function SearchComponent({
  allData,
  setGazetteerHit,
  gazetteerHit,
  mapRef,
  overlayFeature,
  setOverlayFeature,
  referenceSystem,
  referenceSystemDefinition,
  ifShowCategories = false,
}) {
  const [options, setOptions] = useState([]);
  const _gazetteerHitTrigger = undefined;

  const internalGazetteerHitTrigger = (hit) => {
    builtInGazetteerHitTrigger(
      hit,
      mapRef.current.leafletMap.leafletElement,
      referenceSystem,
      referenceSystemDefinition,
      setGazetteerHit,
      setOverlayFeature,
      _gazetteerHitTrigger
    );
  };

  const [searchResult, setSearchResult] = useState([]);
  const [allGazeteerData, setAllGazeteerData] = useState([]);
  const [value, setValue] = useState('');

  const debugReplaceWordFunct = replaceFirstWord('bei der Blutfinke', 'auf');
  const handleSearchAutoComplete = (value) => {
    if (allGazeteerData.length > 0) {
      const fuseAddressesOptions = {
        distance: 100,
        useExtendedSearch: true,
        threshold: 0.5,
        keys: ['xSearchData'],
      };
      const fuse = new Fuse(allGazeteerData, fuseAddressesOptions);
      const removeStopWords = removeStopwords(value, stopwords);
      const result = fuse.search(removeStopWords);
      console.log('rrr', result);
      if (ifShowCategories) {
        const groupedResults = mapDataToSearchResult(result);
        setSearchResult(groupedResults);
      } else {
        setOptions(generateOptions(result));
      }
    }
  };
  useEffect(() => {
    if (allData) {
      const allModifiedData = prepareGazData(allData);
      setAllGazeteerData(allModifiedData);
    }
  }, [allData]);

  //   const fuseAddressesOptions = {
  //     distance: 100,
  //     useExtendedSearch: true,
  //     // threshold: 0.5,
  //     threshold: 0.5,
  //     // keys: ["searchData", "an", "auf", "bei"],
  //     keys: ['xSearchData'],
  //   };

  //   const fuse = new Fuse(allGazeteerData, fuseAddressesOptions);

  //   const handleSearchAutoComplete = (value) => {
  //     //const removeStopWords = removeWordsWithSpaces(value);
  //     const removeStopWords = removeStopwords(value, stopwords);
  //     // const removeStopWords = value;
  //     console.log('eee', removeStopWords);
  //     const result = fuse.search(removeStopWords);
  //     // const result = fuse.search(value);
  //     console.log('mmm', result);
  //     const groupedResults = mapDataToSearchResult(result);

  //     setOptions(generateOptions(result));
  //     // setSearchResult(groupedResults);
  //   };

  return (
    <div style={{ marginTop: '40px' }}>
      <Button
        icon={<CloseOutlined />}
        style={{ borderRadius: '4px' }}
        onClick={() => {
          setGazetteerHit(null);
          setValue('');
          setOptions([]);
          setOverlayFeature(null);
        }}
      />
      {!ifShowCategories ? (
        <AutoComplete
          options={options}
          style={{ width: 600, borderRadius: '2px' }}
          onSearch={(value) => handleSearchAutoComplete(value)}
          onChange={(value) => setValue(value)}
          placeholder="Stadtteil | Adresse | POI"
          value={value}
          onSelect={(value, option) => {
            internalGazetteerHitTrigger([option.sData]);
            // setGazetteerHit(option.sData);
            if (
              option.sData.type === 'bezirke' ||
              option.sData.type === 'quartiere'
            ) {
              setGazetteerHit(null);
            } else {
              setGazetteerHit(option.sData);
            }
          }}
        />
      ) : (
        <AutoComplete
          popupClassName="certain-category-search-dropdown"
          popupMatchSelectWidth={500}
          onSearch={(value) => handleSearchAutoComplete(value)}
          style={{
            width: 500,
          }}
          options={searchResult}
          size="large"
          placeholder="category"
        >
          {/* <Input.Search size="large" placeholder="input here" /> */}
        </AutoComplete>
      )}
    </div>
  );
}

export default SearchComponent;

// Prepare with category
// function prepareDataSources(dataObj) {
//   const dataWithCategories = Object.keys(dataObj).map((key) =>
//     addCategoryAndSearchKeys(dataObj[key], key)
//   );

//   return dataWithCategories.flat();
// }
function prepareDataSources(dataObj) {
  const dataWithCategories = Object.keys(dataObj).map((key) =>
    addCategoryAndSearchKeys(dataObj[key], key)
  );

  return dataWithCategories.flat();
}
function removeStopwords(text, stopwords) {
  const words = text.split(' ');
  const placeholderWords = words.map((word) => {
    // Check if the word is in the stopwords array (case insensitive)
    if (stopwords.includes(word.toLowerCase())) {
      // Replace each character in the word with an underscore
      return '_'.repeat(word.length);
    }
    return word;
  });
  return placeholderWords.join(' ');
}
// Prepare with category
// function addCategoryAndSearchKeys(data, category) {
//   return data.map((item) => {
//     const searchData = item?.s
//       ? `${item.s} ${item?.nr || ''} ${item?.z || ''}`
//       : `${item?.n} ${item?.nr || ''}`;
//     const address = {
//       ...item,
//       gr: category,
//       searchData,
//       xSearchData: removeStopwords(searchData, stopwords),
//     };

//     return processPrepositions(address);
//   });
// }
function addCategoryAndSearchKeys(data) {
  return data.map((item) => {
    const searchData = item?.s
      ? `${item.s} ${item?.nr || ''} ${item?.z || ''}`
      : `${item?.n} ${item?.nr || ''}`;
    const address = {
      ...item,
      //   gr: category,
      searchData,
      xSearchData: removeStopwords(searchData, stopwords),
    };
    return address;
    // return processPrepositions(address);
  });
}
function prepareGazData(data) {
  const modifiedData = data.map((item) => {
    const searchData = item?.string;
    const address = {
      ...item,
      //   gr: category,
      //   searchData,
      xSearchData: removeStopwords(searchData, stopwords),
    };
    return address;
    // return processPrepositions(address);
  });

  return modifiedData;
}

function processPrepositions(obj) {
  const address = obj?.searchData.toLowerCase() || '';
  if (
    address.startsWith('in') ||
    address.startsWith('auf') ||
    address.startsWith('an') ||
    address.startsWith('bei')
  ) {
    return {
      ...obj,
      an: replaceFirstWord(address, 'an'),
      in: replaceFirstWord(address, 'in'),
      auf: replaceFirstWord(address, 'auf'),
      bei: replaceFirstWord(address, 'bei'),
      prep: true,
    };
  } else {
    return obj;
  }
}

function replaceFirstWord(address, preposition) {
  const firstWord = address.trim().split(' ');
  firstWord[0] = preposition;

  const result = firstWord.join(' ');

  return result;
}
