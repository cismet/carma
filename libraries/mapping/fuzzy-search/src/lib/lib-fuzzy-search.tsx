import { useEffect, useState, useRef } from "react";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { AutoComplete, Button, Dropdown, message } from "antd";
import type { MenuProps } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLocationDot,
  faTimes,
  faChevronDown,
  faChevronUp,
  faDrawPolygon,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { BaseSelectRef } from "rc-select";

import {
  generateOptions,
  limitSearchResult,
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
import { type SearchResultItem } from "@carma-mapping/fuzzy-search";

import { SearchGazetteerProps, Option, GroupedOptions, SearchItem } from "..";
import { stopwords as stopwordsDe } from "./config/stopwords.de-de";

import "./fuzzy-search.css";
import { useGazData } from "@carma-appframeworks/portals";
import {
  parseLandParcelInput,
  generateLandParcelOptions,
  generateGemarkungOptions,
  tryDirectLandParcelMatch,
  normalizeLandParcelInput,
  LandParcelDataStructure,
  LAND_PARCEL_SEPARATOR,
  parseLandparcelToSelectionItem,
} from "./utils/landParcelSearchHelper";

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

type SearchMode = "gazetteer" | "parcel";

const searchModeConfig: Record<
  SearchMode,
  { label: string; icon: typeof faLocationDot }
> = {
  gazetteer: { label: "Adressen und Orte", icon: faLocationDot },
  parcel: { label: "Flurstücke", icon: faDrawPolygon },
};

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
  hideIcon = false,
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
  showDropdownBelow = false,
  landParcelSearch = false,
}: SearchGazetteerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [showCategories, setShowCategories] = useState(standardSearch);
  const { prepoHandling, ifShowScore, limit, cut, distance, threshold } =
    getDefaultSearchConfig(config);
  let _gazData, _onSelection;

  const onSelectionForLeaflet = useCreateGazetteerSelectorForLeaflet({});

  const {
    gazData: hookedGazData,
    landParcelData: hookedLandParcelData,
    landParcelLoading,
    loadLandParcelData,
  } = useGazData();

  const landParcelData = landParcelSearch
    ? (hookedLandParcelData as LandParcelDataStructure | undefined)
    : undefined;

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
    width: hideIcon ? "100%" : "calc(100% - 32px)",
    borderTopLeftRadius: 0,
    // fontSize: "14px",
  };
  const btnClosRef = useRef<HTMLButtonElement>(null);
  const autoCompleteRef = useRef<BaseSelectRef | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const [fuseInstance, setFuseInstance] =
    useState<FuseWithOption<SearchResultItem> | null>(null);
  const [searchResult, setSearchResult] = useState<GroupedOptions[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState<SearchItem[]>([]);
  const [value, setValue] = useState("");
  const [cleanBtnDisable, setCleanBtnDisable] = useState(true);
  const [fireScrollEvent, setFireScrollEvent] = useState(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("gazetteer");
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [autoCompleteOpen, setAutoCompleteOpen] = useState(false);
  const lastEscRef = useRef(0);

  const triggerLandParcelPreload = () => {
    if (landParcelSearch && !hookedLandParcelData && !landParcelLoading) {
      loadLandParcelData();
    }
  };

  const availableModes = (Object.keys(searchModeConfig) as SearchMode[]).filter(
    (mode) => (mode === "parcel" ? landParcelSearch : true)
  );

  const searchModeMenuItems: MenuProps["items"] = availableModes.map((key) => ({
    key,
    label: searchModeConfig[key].label,
    icon: (
      <FontAwesomeIcon
        icon={searchModeConfig[key].icon}
        style={{ fontSize: "14px" }}
      />
    ),
  }));

  const hasMultipleModes = availableModes.length > 1;

  const dropdownAlign = {
    points: ["bl", "tl"],
    offset: [0, -4],
    overflow: {
      adjustX: false,
      adjustY: showDropdownBelow,
    },
  };

  const handleSearchAutoComplete = (value) => {
    if (landParcelData && value.includes(LAND_PARCEL_SEPARATOR)) {
      const parseState = parseLandParcelInput(value, landParcelData);
      if (parseState.stage !== "none") {
        const parcelOptions = generateLandParcelOptions(
          parseState,
          landParcelData
        );
        setSearchResult(parcelOptions);
        setOptions([]);
        return;
      }
    }

    if (allGazeteerData.length > 0 && fuseInstance) {
      const removeStopWords = removeStopwords(
        value.replace(".", ""), // / Remove dot to have stable score like
        stopwords,
        prepoHandling
      );
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

  const handleOnSelect = (option, skipMapMovement = false) => {
    if (option.isLandParcel) {
      if (option.parcelStage === "gemarkung" || option.parcelStage === "flur") {
        setValue(option.value);
        handleSearchAutoComplete(option.value);
        setTimeout(() => {
          setAutoCompleteOpen(true);
          autoCompleteRef.current?.focus();
        }, 0);
        return;
      }
      if (option.parcelStage === "flurstueck") {
        setValue(option.value);
        setCleanBtnDisable(false);

        const selectionItem = parseLandparcelToSelectionItem(option);

        if (selectionItem) {
          _onSelection(selectionItem, skipMapMovement);
        }
        return;
      }
    }

    setCleanBtnDisable(false);
    console.info("[SEARCH] selected option", option);
    if (option.sData) {
      _onSelection(option.sData, skipMapMovement);
      setValue(option.sData.string);
    } else {
      _onSelection(option, skipMapMovement);
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
      const modifyAdressen: SearchItem[] = [];

      allModifiedData.forEach((item) => {
        if (
          item.glyph === "home" &&
          item.string.toLowerCase().includes("str.")
        ) {
          const newString = item.string.replace(/Str\./gi, "Straße");
          const newObj: SearchItem = {
            ...item,
            // string: newString,
            // sorter: item.sorter
            //   ? `${item.sorter}_strasse`
            //   : `${Date.now()}_${Math.random()}`,
            xSearchData: newString,
          };

          modifyAdressen.push(newObj);
        }
      });
      setAllGazeteerData([...allModifiedData, ...modifyAdressen]);
    }
  }, [_gazData, prepoHandling]);

  useEffect(() => {
    if (allGazeteerData.length > 0) {
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
  }, [allGazeteerData, distance, threshold]);

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
        let firstCategoryText = "";
        if (searchResult.length > 0 && searchResult[0].titleText) {
          firstCategoryText = searchResult[0].titleText;
        } else {
          const allTitles = document.querySelectorAll("[data-title]");
          if (allTitles.length > 0) {
            const firstTitle = allTitles[0] as HTMLElement;
            firstCategoryText = firstTitle.innerText;
          }
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
  }, [dropdownContainerRef, options, searchResult, fireScrollEvent, value]);

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
      handleOnSelect(selection, true);
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
      className={`fuzzy-search-container${
        hideIcon ? " fuzzy-search-container--no-icon" : ""
      }`}
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          const now = Date.now();
          if (now - lastEscRef.current < 500) {
            const currentIndex = availableModes.indexOf(searchMode);
            const nextMode =
              availableModes[(currentIndex + 1) % availableModes.length];
            setSearchMode(nextMode);
            if (nextMode === "parcel") {
              triggerLandParcelPreload();
            }
            setValue("");
            setSearchResult([]);
            setOptions([]);
          }
          lastEscRef.current = now;
        }
      }}
    >
      {hasMultipleModes ? (
        <Dropdown
          menu={{
            items: searchModeMenuItems,
            selectedKeys: [searchMode],
            onClick: ({ key }) => {
              setSearchMode(key as SearchMode);
              setValue("");
              setSearchResult([]);
              setOptions([]);
            },
          }}
          trigger={cleanBtnDisable ? ["click"] : []}
          onOpenChange={(open) => {
            setModeDropdownOpen(open);
            if (open) triggerLandParcelPreload();
          }}
        >
          <Button
            ref={btnClosRef}
            icon={
              landParcelLoading && searchMode === "parcel" ? (
                <FontAwesomeIcon
                  icon={faSpinner}
                  spin
                  style={{ fontSize: "16px" }}
                />
              ) : cleanBtnDisable ? (
                <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <FontAwesomeIcon
                    icon={searchModeConfig[searchMode].icon}
                    style={{ fontSize: "16px" }}
                  />
                  <FontAwesomeIcon
                    icon={modeDropdownOpen ? faChevronDown : faChevronUp}
                    style={{ fontSize: "6px", marginTop: "-8px" }}
                  />
                </span>
              ) : (
                <FontAwesomeIcon style={{ fontSize: "16px" }} icon={faTimes} />
              )
            }
            className="clear-fuzzy-button clear-fuzzy-button__active"
            onClick={cleanBtnDisable ? undefined : handleOnClickClear}
          />
        </Dropdown>
      ) : (
        !hideIcon && (
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
                <FontAwesomeIcon style={{ fontSize: "16px" }} icon={faTimes} />
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
        )
      )}
      <div style={{ position: "relative", width: "calc(100% - 32px)" }}>
        {(() => {
          // Colored Overlay
          const sepIdx = value.lastIndexOf(LAND_PARCEL_SEPARATOR);
          if (landParcelData && sepIdx > 0 && cleanBtnDisable) {
            const prefix = value.substring(0, sepIdx + 1);
            const active = value.substring(sepIdx + 1);
            return (
              <div aria-hidden="true" className="parcel-input-overlay">
                <span style={{ color: "#aaa" }}>{prefix}</span>
                <span style={{ color: "#495057" }}>{active}</span>
              </div>
            );
          }
          return null;
        })()}
        <AutoComplete
          ref={autoCompleteRef}
          dropdownAlign={dropdownAlign}
          options={
            showCategories
              ? searchResult.map(({ titleText, ...rest }) => rest)
              : options
          }
          style={{ width: "100%", borderTopLeftRadius: 0 }}
          onSearch={(value) => {
            if (searchMode === "parcel" && landParcelData) {
              if (value.includes(LAND_PARCEL_SEPARATOR)) {
                const directMatch = tryDirectLandParcelMatch(
                  value,
                  landParcelData
                );
                if (directMatch) {
                  setSearchResult(directMatch);
                  setOptions([]);
                } else {
                  const parseState = parseLandParcelInput(
                    value,
                    landParcelData
                  );
                  if (parseState.stage !== "none") {
                    const parcelOptions = generateLandParcelOptions(
                      parseState,
                      landParcelData
                    );
                    const hasResults = parcelOptions.some(
                      (g) => g.options.length > 0
                    );
                    if (
                      !hasResults &&
                      parseState.stage === "flur_matched" &&
                      parseState.fstckFilter !== ""
                    ) {
                      message.warning("Kein Flurstück gefunden");
                    }
                    setSearchResult(parcelOptions);
                    setOptions([]);
                  } else {
                    const segments = value.split(LAND_PARCEL_SEPARATOR);
                    if (segments.length >= 3 && segments[2].trim() !== "") {
                      message.warning("Kein Flurstück gefunden");
                    }
                    setSearchResult([]);
                    setOptions([]);
                  }
                }
              } else {
                const compactMatch = tryDirectLandParcelMatch(
                  value,
                  landParcelData
                );
                if (compactMatch) {
                  setSearchResult(compactMatch);
                  setOptions([]);
                } else if (normalizeLandParcelInput(value) !== null) {
                  message.warning("Kein Flurstück gefunden");
                  setSearchResult([]);
                  setOptions([]);
                } else {
                  const gemarkungOpts = generateGemarkungOptions(
                    value,
                    landParcelData
                  );
                  setSearchResult(gemarkungOpts);
                  setOptions([]);
                }
              }
            } else {
              handleSearchAutoComplete(value);
            }
          }}
          onChange={(value) => {
            if (autoCompleteRef?.current) {
              autoCompleteRef.current.scrollTo(0);
            }
            setValue(value);

            if (value === "") {
              setSearchResult([]);
            }
          }}
          placeholder={
            searchMode === "parcel" && landParcelSearch
              ? `Gemarkung${LAND_PARCEL_SEPARATOR}Flur${LAND_PARCEL_SEPARATOR}Flurstück`
              : placeholder
          }
          value={value}
          open={autoCompleteOpen}
          onDropdownVisibleChange={(visible) => {
            setAutoCompleteOpen(visible);
            if (
              visible &&
              value === "" &&
              searchMode === "parcel" &&
              landParcelData
            ) {
              const gemarkungOpts = generateGemarkungOptions(
                "",
                landParcelData
              );
              setSearchResult(gemarkungOpts);
              setOptions([]);
            }
          }}
          onSelect={(value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          className={
            value.includes(LAND_PARCEL_SEPARATOR) &&
            landParcelData &&
            cleanBtnDisable
              ? "parcel-input-transparent"
              : ""
          }
          dropdownRender={(item) => {
            return (
              <div className="fuzzy-dropdownwrapper" ref={dropdownContainerRef}>
                {item}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
