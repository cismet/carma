import { titleMapConfig } from './config';
import { StopWords } from './types';
import { md5FetchText, fetchJSON } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

export const titleMap = new Map(Object.entries(titleMapConfig));

export function removeStopwords(text, stopwords: StopWords) {
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

export function prepareGazData(data, stopwords: StopWords) {
  const modifiedData = data.map((item) => {
    const searchData = item?.string;
    const address = {
      ...item,
      xSearchData: removeStopwords(searchData, stopwords),
    };
    return address;
  });

  return modifiedData;
}

export const getGazData = async (
  sourcesConfig,
  prefix: string,
  setGazData: (gazData: any) => void
) => {
  const sources = {};

  await Promise.all(
    Object.entries(sourcesConfig).map(async ([source, url]) => {
      sources[source] = await md5FetchText(prefix, url);
    })
  );

  const gazData = getGazDataForTopicIds(sources, Object.keys(sourcesConfig));

  setGazData(gazData);
};
