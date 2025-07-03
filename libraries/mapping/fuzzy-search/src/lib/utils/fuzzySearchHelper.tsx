import {
  ENDPOINT,
  isEndpoint,
  NAMED_CATEGORIES,
  NamedCategory,
  isAreaType,
} from "@carma-commons/resources";

import {
  SearchResult,
  Option,
  GroupedOptions,
  SearchConfig,
  SearchResultItemWithScore,
} from "../..";
import { type SearchResultItem } from "@carma-commons/types";
import { type FuseWithOption } from "../lib-fuzzy-search";

import Icon from "react-cismap/commons/Icon";

import { stopwords } from "../config/stopwords.de-de";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { useSelection } from "@carma-apps/portals";

export const renderCategoryTitle = (
  category: ENDPOINT,
  namedCategories: Partial<NamedCategory>
) => {
  const title = namedCategories[category] || category;
  return <span>{title}</span>;
};

export const joinNumberLetter = (name: string) =>
  name.replace(/(\d+)\s([a-zA-Z])/g, "$1$2");

export const renderItem = (
  searchResultItem: SearchResultItem,
  showScore = false,
  score,
  category: string = "default"
) => {
  const searchResultItemLabel = buildAddressWithIconUI(
    searchResultItem,
    showScore,
    score,
    category
  );
  return {
    key: searchResultItem.sorter,
    value:
      searchResultItem.string +
      "." +
      searchResultItem.type +
      "." +
      searchResultItem.sorter,
    label: searchResultItemLabel,
    sData: searchResultItem,
  };
};

export function buildAddressWithIconUI(
  addresObj: SearchResultItem,
  showScore = false,
  score?: number,
  category: string = "default"
) {
  const overlay = addresObj?.overlay || null;

  let icon;
  if (addresObj.glyph === "pie-chart") {
    icon = "chart-pie";
  } else {
    icon = addresObj.glyph;
  }

  const iconPrefix = addresObj?.glyphPrefix ? addresObj.glyphPrefix : "fas ";
  const iconWithoutOverlay =
    addresObj?.glyph === "code-fork" ? (
      <span style={{ fontSize: "16px" }}>
        <Icon name={addresObj.glyph} />
      </span>
    ) : (
      <i className={icon && iconPrefix + "fa-" + icon}></i>
    );

  const streetLabel = (
    <div style={{ paddingLeft: "0.3rem" }} data-category={category}>
      <span style={{ marginRight: "0.4rem" }}>
        {!overlay ? (
          // <i className={icon && iconPrefix + "fa-" + icon}></i>
          iconWithoutOverlay
        ) : (
          <Icon name={addresObj.glyph} overlay={overlay} marginRight="2px" />
        )}
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
  showScore = false
) => {
  return results.map((result, idx) => {
    const streetLabel = buildAddressWithIconUI(
      result.item,
      showScore,
      result.score
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
  data: SearchResult<SearchResultItem>[]
) => {
  const splittedCategories: { [key: string]: Option[] } = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.type;

    if (splittedCategories.hasOwnProperty(catName)) {
      splittedCategories[catName].push(renderItem(address, false, ""));
    } else {
      splittedCategories[catName] = [renderItem(address, false, "")];
    }
  });

  const prepareOptions: GroupedOptions[] = [];

  Object.keys(splittedCategories).forEach((item: string) => {
    let optionItem: GroupedOptions = {};

    if (!optionItem.hasOwnProperty(item) && isEndpoint(item)) {
      optionItem.label = renderCategoryTitle(item, NAMED_CATEGORIES);
      optionItem.options = splittedCategories[item];
    } else {
      console.warn(`category ${item} does not match known endpoints`, ENDPOINT);
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
export function prepareGazData(data, prepoHandling, typeInference) {
  const modifiedData = data.map((item) => {
    const searchData = item?.string;
    const stringWithoutStopWords = removeStopwords(
      searchData,
      stopwords,
      prepoHandling
    );

    // Overwrite the already existing type with a type from the typeInferenceObject
    if (typeInference && typeInference[item.type]) {
      item.type = typeInference[item.type](item);
    } else if (typeInference && !item.type && typeInference["withoutType"]) {
      item.type = typeInference["withoutType"](item);
    }
    const gazElement = {
      ...item,
      // type: item.glyph === "graduation-cap" ? "schulen" : item.type,
      xSearchData: item.modifiedSearchData
        ? item.modifiedSearchData
        : joinNumberLetter(stringWithoutStopWords),
    };

    return gazElement;
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
  let limitedScore = searchRes[0]?.score < cut ? searchRes[0]?.score : cut;
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

export const mapDataWithCategory = (
  data: SearchResult<SearchResultItem>[],
  showScore: boolean,
  priorityTypes: string[] | null
) => {
  const splittedCategories: { [key: string]: Option[] } = {};

  if (priorityTypes && priorityTypes.length) {
    data.sort((a, b) => {
      const aIndex = priorityTypes.indexOf(a.item.type);
      const bIndex = priorityTypes.indexOf(b.item.type);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  // data.sort((a, b) => a.score - b.score);
  data.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  data.forEach((item) => {
    const address = item.item;
    const catName = String(item.score);

    if (splittedCategories.hasOwnProperty(catName)) {
      splittedCategories[catName].push(
        renderItem(
          address,
          showScore,
          item.score,
          convertScoreToCategory(catName)
        )
      );
    } else {
      splittedCategories[catName] = [
        renderItem(
          address,
          showScore,
          item.score,
          convertScoreToCategory(catName)
        ),
      ];
    }
  });

  const prepareOptions: GroupedOptions[] = [];

  Object.keys(splittedCategories).forEach((item: string) => {
    let optionItem: GroupedOptions = {};

    if (!optionItem.hasOwnProperty(item)) {
      optionItem.label = renderCategoryTitleWithScore(item);
      optionItem.options = splittedCategories[item];
    } else {
      console.warn(`category ${item} does not match known endpoints`, ENDPOINT);
    }

    prepareOptions.push(optionItem);
  });

  return prepareOptions;
};

export const renderCategoryTitleWithScore = (title: string) => {
  let category = "";

  switch (title) {
    case "0":
      category = "Perfekte Treffer";
      break;
    case "0.1":
      category = "Sehr gute Treffer";
      break;
    case "0.2":
      category = "Gute Treffer";
      break;
    case "0.3":
      category = "Befriedigende Treffer";
      break;
    case "0.4":
      category = "Ausreichende Treffer";
      break;
    default:
      category = "Treffer";
  }
  return (
    <span
      style={{
        paddingBottom: "-100px",
      }}
      data-title="category-title"
    >
      {category}
    </span>
  );
};

const convertScoreToCategory = (score) => {
  let category = "";

  switch (score) {
    case "0":
      category = "Perfekte Treffer";
      break;
    case "0.1":
      category = "Sehr gute Treffer";
      break;
    case "0.2":
      category = "Gute Treffer";
      break;
    case "0.3":
      category = "Befriedigende Treffer";
      break;
    case "0.4":
      category = "Ausreichende Treffer";
      break;
    default:
      category = "Treffer";
  }

  return category;
};

export const createOrUpdateVisibleCategory = (
  firstCategoryText,
  dropdownContainerRef
) => {
  const additionalTitle = document.getElementById("advance-title");
  if (!additionalTitle) {
    const categoryWrapper = document.createElement("div");
    categoryWrapper.id = "advance-title";
    categoryWrapper.style.fontSize = "12px";
    categoryWrapper.style.color = "rgba(0, 0, 0, 0.45)";
    categoryWrapper.style.padding = "9px 16px 0px";
    categoryWrapper.style.position = "absolute";
    categoryWrapper.style.left = "0";
    categoryWrapper.style.top = "0";
    categoryWrapper.style.width = "100%";
    categoryWrapper.style.backgroundColor = "white";

    const categoryText = document.createElement("span");
    categoryText.innerText = firstCategoryText;

    categoryText.id = "advance-title-text";

    categoryWrapper.appendChild(categoryText);

    dropdownContainerRef.current.appendChild(categoryWrapper);
  } else {
    const stickyTitle = document.getElementById("advance-title-text");
    const category = getCategoryNameInFirstSearchItem();
    if (stickyTitle) {
      stickyTitle.innerText = category ? category : firstCategoryText;
    }
  }
};

export const getCategoryNameInFirstSearchItem = () => {
  const itemWithCategory = document.querySelectorAll("[data-category]");
  const firstTitle = itemWithCategory[0] as HTMLElement;
  const category = firstTitle.dataset.category;

  return category;
};

export const smoothCategoriesTransition = (
  topOffset,
  additionalTitle,
  category
) => {
  if (topOffset <= 20 && additionalTitle) {
    additionalTitle.style.display = "none";
  } else if (topOffset > 20 && topOffset <= 30 && category && additionalTitle) {
    additionalTitle.style.display = "block";

    additionalTitle.style.opacity = "" + (topOffset - 20) / 10;
    additionalTitle.innerText = category;
  } else if (topOffset > 30 && category && additionalTitle) {
    additionalTitle.style.opacity = "1";
    additionalTitle.innerText = category;
    additionalTitle.style.display = "block";
  }
};

export const useCreateGazetteerSelectorForLeaflet = ({
  before = () => {},
  after = () => {},
}) => {
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);

  const { setSelection } = useSelection();

  const onGazetteerSelection = (selection) => {
    before();
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
      after();
    }, 100);
  };

  return onGazetteerSelection;
};

export const defaultTypeInference = {
  adressen: (item) => {
    if (item.glyph === "home") {
      return "adressen";
    } else if (item.glyph === "road") {
      return "streets";
    } else {
      return "adressen";
    }
  },

  pois: (item) => {
    if (item.glyph === "tag") {
      return "pois";
    } else if (item.glyph === "tags") {
      return "poisAlternativeNames";
    } else if (item.glyph === "graduation-cap") {
      return "schulen";
    } else {
      return "pois";
    }
  },
};

export const removedDoubledSearchRes = (
  resData: SearchResult<SearchResultItem>[]
) => {
  const cleanRes: SearchResult<SearchResultItem>[] = [];
  const seen = new Set();

  for (const entry of resData) {
    const sorter = entry.item.sorter;
    if (!seen.has(sorter)) {
      seen.add(sorter);
      cleanRes.push(entry);
    }
  }

  return cleanRes;
};
