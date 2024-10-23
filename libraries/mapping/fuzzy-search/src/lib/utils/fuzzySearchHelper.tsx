
import {
  SearchResultItem,
  SearchResult,
  Option,
  GruppedOptions,
  SourceConfig,
  GazDataItem,
  SourceWithPayload,
  PayloadItem,
  SearchConfig,
} from "../..";

import { md5FetchText } from "./fetching";

import { stopwords } from "../config/stopwords.de-de";
import ENDPOINT, { NAMED_CATEGORIES, type NamedCategory } from "../config/endpoints";
import { isEndpoint } from '../config/index';

export const renderCategoryTitle = (category: ENDPOINT, namedCategories: Partial<NamedCategory>) => {
  const title = namedCategories[category] || category;
  return <span>{title}</span>;
};

export const joinNumberLetter = (name: string) =>
  name.replace(/(\d+)\s([a-zA-Z])/g, "$1$2");
export const renderItem = (address: SearchResultItem) => {
  const addressLabel = buildAddressWithIconUI(address, false);
  return {
    key: address.sorter,
    value: address.string,
    label: addressLabel,
    sData: address,
  };
};

export function buildAddressWithIconUI(
  addresObj: SearchResultItem,
  showScore = false,
  score?: number,
) {
  let icon;
  if (addresObj.glyph === "pie-chart") {
    icon = "chart-pie";
  } else {
    icon = addresObj.glyph;
  }
  const streetLabel = (
    <div style={{ paddingLeft: "0.3rem" }}>
      <span style={{ marginRight: "0.4rem" }}>
        <i className={icon && "fas " + "fa-" + icon}></i>
        {"  "}
      </span>
      <span>
        {showScore ? (
          <span>
            <span>{joinNumberLetter(addresObj.string)}</span>
            <span style={{ color: "gray" }}> ({score})</span>
          </span>
        ) : (
          joinNumberLetter(addresObj.string)
        )}
      </span>
    </div>
  );

  return streetLabel;
}
export const generateOptions = (
  results: SearchResult<SearchResultItem>[],
  showScore = false,
) => {
  return results.map((result, idx) => {
    const streetLabel = buildAddressWithIconUI(
      result.item,
      showScore,
      result.score,
    );
    return {
      key: result.item.sorter,
      label: <div>{streetLabel}</div>,
      value: result.item?.string,
      sData: result.item,
    };
  });
};
export const mapDataToSearchResult = (
  data: SearchResult<SearchResultItem>[],
) => {
  const splittedCategories: { [key: string]: Option[] } = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.type;

    if (splittedCategories.hasOwnProperty(catName)) {
      splittedCategories[catName].push(renderItem(address));
    } else {
      splittedCategories[catName] = [renderItem(address)];
    }
  });

  const prepareOptions: GruppedOptions[] = [];

  Object.keys(splittedCategories).forEach((item: string) => {
    let optionItem: GruppedOptions = {};

    if (!optionItem.hasOwnProperty(item) && isEndpoint(item)) {
      optionItem.label = renderCategoryTitle(item, NAMED_CATEGORIES);
      optionItem.options = splittedCategories[item];
    } else {
      console.warn(`category ${item} does not match known endpoints`, ENDPOINT)
    }

    prepareOptions.push(optionItem);
  });

  return prepareOptions;
};

export function removeStopwords(text, stopwords, prepoHandling) {
  if (prepoHandling) {
    const words = text.split(" ");
    const placeholderWords = words.map((word) => {
      if (stopwords.includes(word.toLowerCase())) {
        // Replace each character in the word with an underscore
        return "_".repeat(word.length);
      }
      return word;
    });
    return placeholderWords.join(" ");
  } else {
    return text;
  }
}
export function prepareGazData(data, prepoHandling) {
  const modifiedData = data.map((item) => {
    const searchData = item?.string;
    const stringWithoutStopWords = removeStopwords(
      searchData,
      stopwords,
      prepoHandling,
    );
    const address = {
      ...item,
      xSearchData: joinNumberLetter(stringWithoutStopWords),
    };
    return address;
  });

  return modifiedData;
}
export function customSort(a, b) {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  if (a.item.type !== b.item.type) {
    return a.item.type.localeCompare(b.item.type);
  }

  if (!a.item.sorter || !a.item.sorter) {
    return a.item.xSearchData.localeCompare(a.item.xSearchData);
  } else {
    return a.item.sorter - b.item.sorter;
  }
}
export function limitSearchResult(searchRes, limit, cut = 0.4) {
  let limitedScore = searchRes[0].score < cut ? searchRes[0].score : cut;
  let countOfCategories = 1;
  searchRes.forEach((r) => {
    if (r.score <= cut && r.score > limitedScore && countOfCategories < limit) {
      limitedScore = r.score;
      countOfCategories += 1;
    }
  });

  const limitedresults = searchRes.filter((r) => r.score <= limitedScore);

  return limitedresults;
}

const dummyItem = {
  s: undefined,
  g: undefined,
  x: undefined,
  y: undefined,
  m: undefined,
  n: undefined,
  nr: undefined,
};

export const getGazDataFromSources = (
  sources: SourceWithPayload[],
): GazDataItem[] => {
  let sorter = 0;
  const gazData: GazDataItem[] = [];

  sources.forEach((source) => {
    const { topic, payload, crs, url } = source;
    if (typeof payload !== "string") {
      console.warn("payload is not a string", topic, url, payload);
      return;
    }

    const items = JSON.parse(payload);
    items.forEach(
      ({
        s: string = "",
        g: glyph = "",
        x,
        y,
        m: more = {},
        n = "",
        nr,
        z,
      }: PayloadItem = dummyItem) => {
        if (x === undefined || y === undefined) {
          console.info("missing coordinates", topic, url, payload);
          return;
        }

        const g: GazDataItem = {
          sorter: sorter++,
          crs,
          string,
          glyph,
          x,
          y,
          more,
          type: topic,
        };

        switch (topic) {
          case "aenderungsv":
            g.overlay = "F";
            break;
          case "adressen":
            if (nr !== "" && nr !== 0) {
              g.string += " " + nr;
            }
            if (z !== "") {
              g.string += " " + z;
            }
            break;
          case "bplaene":
            g.overlay = "B";
            break;
          case "ebikes":
            g.string = n;
            g.glyph = more.id?.startsWith("V") ? "bicycle" : "charging-station";
            break;
          case "emob":
            g.string = n;
            break;
          case "geps":
            g.glyph = "code-fork";
            break;
          case "geps_reverse":
            g.glyph = "code-fork";
            break;
          case "no2":
            g.glyphPrefix = "fab ";
            break;
          case "prbr":
            g.string = n;
            break;
          default:
            break;
        }

        gazData.push(g);
      },
    );
  });

  return gazData;
};

export const getGazData = async (
  sourcesConfig: SourceConfig[],
  prefix: string,
  setGazData: (gazData: GazDataItem[]) => void,
) => {
  await Promise.all(
    sourcesConfig.map(async (config) => {
      (config as SourceWithPayload).payload = await md5FetchText(
        prefix,
        config.url,
      );
    }),
  );

  const gazData = getGazDataFromSources(sourcesConfig as SourceWithPayload[]);

  setGazData(gazData);
};


export const getDefaultSearchConfig = (config: SearchConfig): SearchConfig => {
  let prepoHandling;
  let ifShowScore;
  let limit;
  let cut;
  let distance;
  let threshold;

  if (!config.prepoHandling) {
    prepoHandling = false;
  } else {
    prepoHandling = config.prepoHandling;
  }
  if (!config.ifShowScore) {
    ifShowScore = false;
  } else {
    ifShowScore = config.ifShowScore;
  }
  if (!config.limit) {
    limit = 3;
  } else {
    limit = config.limit;
  }
  if (!config.cut) {
    cut = 0.4;
  } else {
    cut = config.cut;
  }
  if (!config.distance) {
    distance = 100;
  } else {
    distance = config.distance;
  }
  if (!config.threshold) {
    threshold = 0.5;
  } else {
    threshold = config.threshold;
  }

  return {
    prepoHandling,
    ifShowScore,
    limit,
    cut,
    distance,
    threshold,
  };
};
