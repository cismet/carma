import { useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import { AutoComplete, Input } from 'antd';
// import addresses from "./gazeteerdata/shortAdressenList.json";
import addresses from './gazeteerdata/adressen.json';
import districts from './gazeteerdata/bezirke.json';
import ebikes from './gazeteerdata/ebikes.json';
import geps from './gazeteerdata/geps.json';
import kitas from './gazeteerdata/kitas.json';
import no2 from './gazeteerdata/no2.json';
import pois from './gazeteerdata/pois.json';
import prbr from './gazeteerdata/prbr.json';
import experimental from './gazeteerdata/testadresses.json';
import shortAdressenList from './gazeteerdata/shortAdressenList.json';

const renderTitle = (title) => {
  return <span>{title}</span>;
};

const renderItem = (item) => ({
  key: `${item?.searchData || '-'}${item?.s || '-'}${item?.n || '-'}${
    item?.nr
  }${item?.g || '-'}${item?.nr}${item?.gr || '-'}${item?.x || '-'}${
    item?.y || '-'
  }`,
  value: item.s,
  label: (
    <div
      style={{
        display: 'flex',
        justifyContent: 'start',
      }}
    >
      <span style={{ marginRight: '6px' }}>
        <i className={item?.g && 'fas ' + 'fa-' + item.g}></i>
        {'  '}
      </span>
      {item.searchData}
    </div>
  ),
});

const generateOptions = (results) => {
  return results.map((result, idx) => {
    const streetLabel = (
      <div>
        <span>
          <i className={result.item?.g && 'fas ' + 'fa-' + result.item.g}></i>
          {'  '}
        </span>
        <span>{result.item?.searchData}</span>
      </div>
    );

    return {
      key: idx,
      label: <div>{streetLabel}</div>,
      value: result.item?.searchData,
    };
  });
};

const mapDataToSearchResult = (data) => {
  const splittedCategories = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.gr;

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

function SearchComponent({ allData }) {
  const [options, setOptions] = useState([]);

  // const [searchResult, setSearchResult] = useState([]);
  const [allGazeteerData, setAllGazeteerData] = useState([]);

  const debugReplaceWordFunct = replaceFirstWord('bei der Blutfinke', 'auf');
  console.log('qqq', debugReplaceWordFunct);

  useEffect(() => {
    // const allData = {
    //   addresses,
    //   districts,
    //   ebikes,
    //   geps,
    //   kitas,
    //   no2,
    //   pois,
    //   prbr,
    // };

    const allModifiedData = prepareDataSources(allData);
    console.log('ppp', allModifiedData);

    setAllGazeteerData(allModifiedData);
  }, []);

  const fuseAddressesOptions = {
    distance: 100,
    useExtendedSearch: true,
    // threshold: 0.5,
    threshold: 0.5,
    // keys: ["searchData", "an", "auf", "bei"],
    keys: ['xSearchData'],
  };

  const fuse = new Fuse(allGazeteerData, fuseAddressesOptions);

  const handleSearchAutoComplete = (value) => {
    //const removeStopWords = removeWordsWithSpaces(value);
    const removeStopWords = removeStopwords(value, stopwords);
    // const removeStopWords = value;
    console.log('eee', removeStopWords);
    const result = fuse.search(removeStopWords);
    // const result = fuse.search(value);
    console.log('mmm', result);
    const groupedResults = mapDataToSearchResult(result);

    setOptions(generateOptions(result));
    // setSearchResult(groupedResults);
  };

  return (
    <div>
      <AutoComplete
        options={options}
        style={{ width: 600 }}
        onSearch={(value) => handleSearchAutoComplete(value)}
      />
      <hr />
      <div>
        {/* <AutoComplete
        popupClassName="certain-category-search-dropdown"
        popupMatchSelectWidth={500} 
        onSearch={(value) => handleSearchAutoComplete(value)}
        style={{
          width: 500,
        }}
        options={searchResult}
        size="large"
      >
      <Input.Search size="large" placeholder="input here" />
    </AutoComplete> */}
      </div>
    </div>
  );
}

export default SearchComponent;

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
function addCategoryAndSearchKeys(data, category) {
  return data.map((item) => {
    const searchData = item?.s
      ? `${item.s} ${item?.nr || ''} ${item?.z || ''}`
      : `${item?.n} ${item?.nr || ''}`;
    const address = {
      ...item,
      gr: category,
      searchData,
      xSearchData: removeStopwords(searchData, stopwords),
    };

    return processPrepositions(address);
  });
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
