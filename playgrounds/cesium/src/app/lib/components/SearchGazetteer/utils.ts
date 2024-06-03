import { titleMapConfig } from './config';
import {
  GazDataItem,
  SourceConfig,
  SourceWithPayload,
  StopWords,
} from './types';
import { md5FetchText } from './tools/fetching';
import { getGazDataFromSources } from './tools/gazetteerHelper';
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
  sourcesConfig: SourceConfig[],
  prefix: string,
  setGazData: (gazData: GazDataItem[]) => void
) => {
  console.log('getGazData', sourcesConfig);
  await Promise.all(
    sourcesConfig.map(async (config) => {
      (config as SourceWithPayload).payload = await md5FetchText(
        prefix,
        config.url
      );
    })
  );

  console.log('sourcesConfig', sourcesConfig);

  const gazData = getGazDataFromSources(sourcesConfig as SourceWithPayload[]);

  console.log('gazData', gazData && gazData.length > 0 ? gazData[0] : gazData);

  setGazData(gazData);
};
