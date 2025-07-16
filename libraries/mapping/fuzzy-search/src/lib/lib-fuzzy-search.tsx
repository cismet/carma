import { useEffect, useState, useRef } from "react";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { AutoComplete, Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import type { BaseSelectRef } from "rc-select";

import IconComp from "react-cismap/commons/Icon";

import {
  generateOptions,
  limitSearchResult,
  mapDataToSearchResult,
  prepareGazData,
  removeStopwords,
  getDefaultSearchConfig,
  mapDataWithCategory,
  createOrUpdateVisibleCategory,
  getCategoryNameInFirstSearchItem,
  smoothCategoriesTransition,
  useCreateGazetteerSelectorForLeaflet,
  removedDoubledSearchRes,
} from "./utils/fuzzySearchHelper";
import { type SearchResultItem } from "@carma-commons/types";

import { SearchGazetteerProps, Option, GroupedOptions } from "..";
import { stopwords as stopwordsDe } from "./config/stopwords.de-de";

import "./fuzzy-search.css";
import { useGazData } from "@carma-apps/portals";

export interface FuseWithOption<T> extends Fuse<T> {
  options?: IFuseOptions<T>;
}

const defaultIcon = (
  <FontAwesomeIcon
    icon={faLocationDot}
    style={{
      fontSize: "16px",
    }}
  />
);

export function LibFuzzySearch({
  gazData,
  onSelection,
  //referenceSystem,
  //referenceSystemDefinition,
  stopwords = stopwordsDe,
  pixelwidth = 300,
  ifShowCategories: standardSearch = true,
  placeholder = "Wohin?",
  priorityTypes,
  typeInference,
  onCLose = () => {},
  icon = defaultIcon,
  ifIconDisabled = true,
  config = {
    prepoHandling: false,
    ifShowScore: false,
    limit: 3,
    cut: 0.4,
    distance: 100,
    threshold: 0.5,
  },
  selection,
}: SearchGazetteerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [showCategories, setShowCategories] = useState(standardSearch);
  const { prepoHandling, ifShowScore, limit, cut, distance, threshold } =
    getDefaultSearchConfig(config);
  let _gazData, _onSelection;

  const onSelectionForLeaflet = useCreateGazetteerSelectorForLeaflet({});

  const { gazData: hookedGazData } = useGazData();

  if (gazData) {
    _gazData = gazData;
  } else {
    _gazData = hookedGazData;
  }

  if (onSelection) {
    _onSelection = onSelection;
  } else {
    _onSelection = onSelectionForLeaflet;
  }

  const inputStyle = {
    width: "calc(100% - 32px)",
    borderTopLeftRadius: 0,
    // fontSize: "14px",
  };
  const btnClosRef = useRef<HTMLButtonElement>(null);
  const autoCompleteRef = useRef<BaseSelectRef | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const [fuseInstance, setFuseInstance] =
    useState<FuseWithOption<SearchResultItem> | null>(null);
  const [searchResult, setSearchResult] = useState<GroupedOptions[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState([]);
  const [value, setValue] = useState("");
  const [cleanBtnDisable, setCleanBtnDisable] = useState(true);
  const [fireScrollEvent, setFireScrollEvent] = useState(null);

  const dropdownAlign = {
    points: ["bl", "tl"],
    offset: [0, -4],
    overflow: {
      adjustX: 0,
      adjustY: 0,
    },
  };

  const handleSearchAutoComplete = (value) => {
    if (allGazeteerData.length > 0 && fuseInstance) {
      const removeStopWords = removeStopwords(value, stopwords, prepoHandling);
      const result = fuseInstance.search(removeStopWords);
      const cleanedFromDoubledRes = removedDoubledSearchRes(result);
      let resultWithRoundScore = cleanedFromDoubledRes.map((r) => {
        if (r.score) {
          return {
            ...r,
            score: Number(r.score.toFixed(1)),
          };
        } else {
          return r;
        }
      });

      if (limit !== 0) {
        resultWithRoundScore = limitSearchResult(
          resultWithRoundScore,
          limit,
          cut
        );
      }

      if (showCategories) {
        const priority = priorityTypes ? priorityTypes : null;
        const dataWithCategory = mapDataWithCategory(
          resultWithRoundScore,
          ifShowScore === undefined ? false : ifShowScore,
          priority
        );
        // setOptions(generateOptions(resultWithRoundScore, ifShowScore));
        setSearchResult(dataWithCategory);
      } else {
        setOptions(generateOptions(resultWithRoundScore, ifShowScore));
      }
    }
  };

  useEffect(() => {
    if (autoCompleteRef.current) {
      const childNodes = autoCompleteRef.current;
      autoCompleteRef.current.scrollTo(0);
    }
  }, [options]);

  const handleOnSelect = (option) => {
    setCleanBtnDisable(false);
    console.info("[SEARCH] selected option", option);
    if (option.sData) {
      _onSelection(option.sData);
      setValue(option.sData.string);
    } else {
      _onSelection(option);
      setValue(option.string);
    }

    setTimeout(() => {
      btnClosRef.current?.focus();
    }, 100);
  };

  useEffect(() => {
    if (_gazData) {
      const allModifiedData = prepareGazData(
        _gazData,
        prepoHandling,
        typeInference
      );
      setAllGazeteerData(allModifiedData);
    }
  }, [_gazData, prepoHandling]);

  useEffect(() => {
    if (!fuseInstance && allGazeteerData.length > 0) {
      const fuseAddressesOptions = {
        distance,
        threshold,
        useExtendedSearch: true,
        keys: ["xSearchData"],
        includeScore: true,
        // ignoreLocation: true,
      };

      const fuse = new Fuse(allGazeteerData, fuseAddressesOptions);

      setFuseInstance(fuse);
    }
  }, [allGazeteerData, fuseInstance]);

  useEffect(() => {
    if (dropdownContainerRef.current) {
      const allItems = dropdownContainerRef.current.querySelectorAll(
        ".ant-select-item-option-content"
      );

      const holderInner = dropdownContainerRef.current.querySelector(
        ".rc-virtual-list-holder-inner"
      );
      const listHolder = dropdownContainerRef.current.querySelector(
        ".rc-virtual-list-holder > div:first-child"
      );

      const antdDrapdownSelect = dropdownContainerRef.current.querySelector(
        ".rc-virtual-list-holder"
      );
      const inputElement = document.querySelector(
        ".fuzzy-search-container .ant-select-selection-search-input"
      );

      if (showCategories) {
        const allTitles = document.querySelectorAll("[data-title]");
        let firstCategoryText = "";
        if (allTitles.length > 0) {
          const firstTitle = allTitles[0] as HTMLElement;
          firstCategoryText = firstTitle.innerText;
        }

        createOrUpdateVisibleCategory(firstCategoryText, dropdownContainerRef);
      }

      if (
        inputElement &&
        antdDrapdownSelect &&
        listHolder instanceof HTMLElement
      ) {
        const inputWidth = inputElement.scrollWidth;
        let topOffset = 39;

        if (holderInner instanceof HTMLElement) {
          holderInner.style.width = inputWidth + 10 + "px";

          const handleScroll = (event) => {
            if (showCategories) {
              const allTitles = document.querySelectorAll("[data-title]");

              const additionalTitle =
                document.getElementById("advance-title-text");
              const category = getCategoryNameInFirstSearchItem();

              if (allTitles.length > 0 && dropdownContainerRef.current) {
                const wrapperPos =
                  dropdownContainerRef.current.getBoundingClientRect();
                const catPos = allTitles[0].getBoundingClientRect();

                topOffset = Math.abs(catPos.top - wrapperPos.top);
              } else {
                topOffset = 39;
              }

              const scrollPosition = event.target?.scrollTop;

              if (scrollPosition > 60) {
                smoothCategoriesTransition(
                  topOffset,
                  additionalTitle,
                  category
                );
              } else {
                if (additionalTitle && category) {
                  additionalTitle.innerText = category;
                }
              }
            }
            setFireScrollEvent(event.target.scrollTop);
          };
          antdDrapdownSelect.addEventListener("scroll", handleScroll);

          let biggestItem = inputWidth;

          allItems.forEach((item) => {
            const itemWidth = item.scrollWidth;
            if (itemWidth > biggestItem) biggestItem = itemWidth;
          });

          const isOverflowing = biggestItem > inputWidth;
          if (isOverflowing) {
            listHolder.style.width = holderInner.scrollWidth + "px";
            holderInner.style.width = holderInner.scrollWidth + 10 + "px";
          } else {
            listHolder.style.removeProperty("width");
          }
        }
      }
    }
  }, [dropdownContainerRef, options, fireScrollEvent, value]);

  const handleOnClickClear = () => {
    {
      setValue("");
      setOptions([]);
      setSearchResult([]);
      setCleanBtnDisable(true);
      _onSelection(null);
      onCLose();
    }
  };

  useEffect(() => {
    if (selection && fuseInstance) {
      handleSearchAutoComplete(selection.string);
    }
  }, [selection, fuseInstance]);

  useEffect(() => {
    if (selection) {
      handleOnSelect(selection);
    }
  }, [selection]);

  return (
    <div
      // ref={divWrapperRef}
      data-test-id="fuzzy-search"
      style={{
        width: pixelwidth,
        display: "flex",
      }}
      className="fuzzy-search-container"
    >
      <Button
        ref={btnClosRef}
        icon={
          cleanBtnDisable ? (
            // <FontAwesomeIcon
            //   icon={faLocationDot}
            //   style={{
            //     fontSize: "16px",
            //   }}
            // />
            icon
          ) : (
            <IconComp name="close" />
          )
        }
        className={
          cleanBtnDisable
            ? "clear-fuzzy-button clear-fuzzy-button__active"
            : "clear-fuzzy-button clear-fuzzy-button__active"
        }
        onClick={handleOnClickClear}
        disabled={ifIconDisabled && cleanBtnDisable}
      />
      {showCategories ? (
        <AutoComplete
          ref={autoCompleteRef}
          // open={true}
          dropdownAlign={dropdownAlign}
          options={searchResult}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          onChange={(value) => {
            if (autoCompleteRef?.current) {
              autoCompleteRef.current.scrollTo(0);
            }
            setValue(value);

            if (value === "") {
              setSearchResult([]);
            }
          }}
          placeholder={placeholder}
          value={value}
          onSelect={(value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          dropdownRender={(item) => {
            return (
              <div className="fuzzy-dropdownwrapper" ref={dropdownContainerRef}>
                {item}
              </div>
            );
          }}
        />
      ) : (
        <AutoComplete
          ref={autoCompleteRef}
          options={options}
          // options={searchResult}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          onChange={(value) => {
            if (autoCompleteRef?.current) {
              autoCompleteRef.current.scrollTo(0);
            }
            setValue(value);
          }}
          placeholder={placeholder}
          value={value}
          dropdownAlign={dropdownAlign}
          onSelect={(value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          dropdownRender={(item) => {
            return (
              <div className="fuzzy-dropdownwrapper" ref={dropdownContainerRef}>
                {item}
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
