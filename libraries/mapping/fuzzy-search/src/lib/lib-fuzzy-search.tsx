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
} from "./utils/fuzzySearchHelper";

import {
  SearchResultItem,
  SearchGazetteerProps,
  Option,
  GroupedOptions,
} from "..";
import { stopwords as stopwordsDe } from "./config/stopwords.de-de";

import "./fuzzy-search.css";

interface FuseWithOption<T> extends Fuse<T> {
  options?: IFuseOptions<T>;
}

export function LibFuzzySearch({
  gazData,
  onSelection,
  //referenceSystem,
  //referenceSystemDefinition,
  stopwords = stopwordsDe,
  pixelwidth = 300,
  ifShowCategories: standardSearch = true,
  placeholder = "Wohin?",
  config = {
    prepoHandling: false,
    ifShowScore: false,
    limit: 3,
    cut: 0.4,
    distance: 100,
    threshold: 0.5,
  },
}: SearchGazetteerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [showCategories, setShowCategories] = useState(standardSearch);
  const { prepoHandling, ifShowScore, limit, cut, distance, threshold } =
    getDefaultSearchConfig(config);

  const inputStyle = {
    width: "calc(100% - 32px)",
    borderTopLeftRadius: 0,
    // fontSize: "14px",
  };
  const autoCompleteRef = useRef<BaseSelectRef | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const [fuseInstance, setFuseInstance] =
    useState<FuseWithOption<SearchResultItem> | null>(null);
  const [searchResult, setSearchResult] = useState<GroupedOptions[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState([]);
  const [value, setValue] = useState("");
  const [cleanBtnDisable, setCleanBtnDisable] = useState(true);
  const [fireScrollEvent, setFireScrollEvent] = useState(null);

  const handleSearchAutoComplete = (value) => {
    if (allGazeteerData.length > 0 && fuseInstance) {
      const removeStopWords = removeStopwords(value, stopwords, prepoHandling);
      const result = fuseInstance.search(removeStopWords);

      let resultWithRoundScore = result.map((r) => {
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
        const dataWithCategory = mapDataWithCategory(
          resultWithRoundScore,
          ifShowScore === undefined ? false : ifShowScore
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
    onSelection(option.sData);
  };

  useEffect(() => {
    if (gazData) {
      const allModifiedData = prepareGazData(gazData, prepoHandling);
      setAllGazeteerData(allModifiedData);
    }
  }, [gazData, prepoHandling]);

  useEffect(() => {
    if (!fuseInstance && allGazeteerData.length > 0) {
      const fuseAddressesOptions = {
        distance,
        threshold,
        useExtendedSearch: true,
        keys: ["xSearchData"],
        includeScore: true,
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
        ".ant-select-selection-search-input"
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
      onSelection(null);
    }
  };

  return (
    <div
      style={{
        width: pixelwidth,
        display: "flex",
      }}
      className="fuzzy-search-container"
    >
      <Button
        icon={
          cleanBtnDisable ? (
            <FontAwesomeIcon
              icon={faLocationDot}
              style={{
                fontSize: "16px",
              }}
            />
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
        disabled={cleanBtnDisable}
      />
      {showCategories ? (
        <AutoComplete
          ref={autoCompleteRef}
          // open={true}
          options={searchResult}
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
          dropdownAlign={{
            points: ["bl", "tl"],
            offset: [0, -4],
          }}
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
          dropdownAlign={{
            points: ["bl", "tl"],
            offset: [0, -4],
          }}
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
