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
  type IconDefinition,
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
import type {
  DynamicModeRerun,
  DynamicSearchGroup,
  DynamicSearchOption,
  GazDataItem,
} from "./gazData";
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

const GAZETTEER_MODE = "gazetteer";
const PARCEL_MODE = "parcel";

const EMPTY_GAZ_DATA: GazDataItem[] = [];

type SearchModeEntry = {
  key: string;
  label: string;
  icon: IconDefinition;
  svgIcon?: string;
  iconSize?: number;
  placeholder?: string;
  showAllOnFocus?: boolean;
  gazData?: GazDataItem[];
  resolve?: (input: string) => Promise<DynamicSearchGroup[]>;
  subscribe?: (rerun: DynamicModeRerun) => () => void;
};

/**
 * One row of a dynamic mode: the label on the left, an optional second line
 * under it, and the hint (a distance, a count) right-aligned. Modes hand in
 * plain data, so every dynamic mode reads the same.
 */
const DynamicModeLabel = ({
  option,
  icon,
  svgIcon,
}: {
  option: DynamicSearchOption;
  icon: IconDefinition;
  svgIcon?: string;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.4rem",
      paddingLeft: "0.3rem",
    }}
  >
    {/* a row may carry its own icon (a category, a kind of place); the mode's
        icon is the fallback, and its svg variant only applies to that one */}
    <SearchModeIcon
      icon={option.icon ?? icon}
      svgIcon={option.icon ? undefined : svgIcon}
      size={14}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {option.label ?? option.value}
      </div>
      {option.detail && (
        <div
          style={{
            fontSize: "11px",
            color: "#8c8c8c",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {option.detail}
        </div>
      )}
    </div>
    {option.hint && (
      <span style={{ color: "#8c8c8c", whiteSpace: "nowrap" }}>
        {option.hint}
      </span>
    )}
  </div>
);

const builtInModes: SearchModeEntry[] = [
  { key: GAZETTEER_MODE, label: "Adressen und Orte", icon: faLocationDot },
  { key: PARCEL_MODE, label: "Flurstücke", icon: faDrawPolygon },
];

const SearchModeIcon = ({
  icon,
  svgIcon,
  size,
  // injected by antd when used as a dropdown menu item icon
  className,
}: {
  icon: IconDefinition;
  svgIcon?: string;
  size: number;
  className?: string;
}) =>
  svgIcon ? (
    <span
      className={["fuzzy-mode-svg-icon", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgIcon }}
    />
  ) : (
    <FontAwesomeIcon
      icon={icon}
      className={className}
      style={{ fontSize: `${size}px` }}
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
  disableAdditionalModes = false,
}: SearchGazetteerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [showCategories, setShowCategories] = useState(standardSearch);
  const { prepoHandling, ifShowScore, limit, cut, distance, threshold } =
    getDefaultSearchConfig(config);
  let _gazData, _onSelection;

  const onSelectionForLeaflet = useCreateGazetteerSelectorForLeaflet({});

  const {
    gazData: hookedGazData,
    additionalModes,
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
  const [searchMode, setSearchMode] = useState<string>(GAZETTEER_MODE);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [autoCompleteOpen, setAutoCompleteOpen] = useState(false);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const lastEscRef = useRef(0);
  /** newest dynamic request, so late answers of older ones are dropped */
  const dynamicRequestRef = useRef(0);

  const triggerLandParcelPreload = () => {
    if (landParcelSearch && !hookedLandParcelData && !landParcelLoading) {
      loadLandParcelData();
    }
  };

  const searchModes: SearchModeEntry[] = [
    ...builtInModes.filter((mode) =>
      mode.key === PARCEL_MODE ? landParcelSearch : true
    ),
    ...(disableAdditionalModes ? [] : additionalModes).map((mode) => ({
      key: mode.key,
      label: mode.label,
      icon: mode.icon ?? faLocationDot,
      svgIcon: mode.svgIcon,
      iconSize: mode.iconSize,
      placeholder: mode.placeholder,
      showAllOnFocus: mode.showAllOnFocus,
      gazData: mode.gazData,
      resolve: mode.resolve,
      subscribe: mode.subscribe,
    })),
  ];
  const availableModes = searchModes.map((mode) => mode.key);
  const activeMode = searchModes.find((mode) => mode.key === searchMode);
  const isAdditionalMode = activeMode?.gazData !== undefined;
  const isDynamicMode = activeMode?.resolve !== undefined;
  // a dynamic mode brings no preloaded data, so it must not fall back to the
  // default gaz data, which would fuzzy search addresses under its own label.
  // The empty set is a constant: a fresh literal here is a new dependency on
  // every render, and the effects below would rebuild and set state forever.
  const activeGazData = isDynamicMode
    ? EMPTY_GAZ_DATA
    : activeMode?.gazData ?? _gazData;

  // fall back when the active additional mode is removed, e.g. on route change
  const availableModeKeys = availableModes.join(",");
  useEffect(() => {
    if (!availableModeKeys.split(",").includes(searchMode)) {
      setSearchMode(GAZETTEER_MODE);
    }
  }, [availableModeKeys, searchMode]);

  // a dynamic mode opens on its own first stage (the category list), so it is
  // asked as soon as it becomes the active mode rather than on the first
  // keystroke, which is what makes "pick a mode, pick a category" work
  useEffect(() => {
    if (isDynamicMode) {
      void runDynamicSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode, isDynamicMode]);

  const searchModeMenuItems: MenuProps["items"] = searchModes.map((mode) => ({
    key: mode.key,
    label: mode.label,
    icon: <SearchModeIcon icon={mode.icon} svgIcon={mode.svgIcon} size={14} />,
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

  const showAllActiveModeEntries = () => {
    const results = allGazeteerData.map((item, refIndex) => ({
      item,
      refIndex,
    }));
    if (showCategories) {
      setSearchResult(
        mapDataWithCategory(results, false, priorityTypes ?? null)
      );
      setOptions([]);
    } else {
      setOptions(generateOptions(results, false));
      setSearchResult([]);
    }
  };

  const handleSearchAutoComplete = (value) => {
    if (
      searchMode === GAZETTEER_MODE &&
      landParcelData &&
      value.includes(LAND_PARCEL_SEPARATOR)
    ) {
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

  const handleParcelSearch = (
    value: string,
    parcelData: LandParcelDataStructure
  ) => {
    if (value.includes(LAND_PARCEL_SEPARATOR)) {
      const directMatch = tryDirectLandParcelMatch(value, parcelData);
      if (directMatch) {
        setSearchResult(directMatch);
        setOptions([]);
        return;
      }

      const parseState = parseLandParcelInput(value, parcelData);
      if (parseState.stage !== "none") {
        const parcelOptions = generateLandParcelOptions(parseState, parcelData);
        const hasResults = parcelOptions.some((g) => g.options.length > 0);
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
      return;
    }

    const compactMatch = tryDirectLandParcelMatch(value, parcelData);
    if (compactMatch) {
      setSearchResult(compactMatch);
      setOptions([]);
    } else if (normalizeLandParcelInput(value) !== null) {
      message.warning("Kein Flurstück gefunden");
      setSearchResult([]);
      setOptions([]);
    } else {
      const gemarkungOpts = generateGemarkungOptions(value, parcelData);
      setSearchResult(gemarkungOpts);
      setOptions([]);
    }
  };

  /**
   * Ask a dynamic mode for the current input. Answers arrive out of order when
   * a mode does real work (a ranking, a map query), so only the newest request
   * is allowed to write; older ones are dropped rather than cancelled.
   */
  const runDynamicSearch = async (
    input: string,
    { openWhenDone = false }: { openWhenDone?: boolean } = {}
  ) => {
    const resolve = activeMode?.resolve;
    if (!resolve) {
      return;
    }
    const requestId = ++dynamicRequestRef.current;
    const isStale = () => requestId !== dynamicRequestRef.current;
    setDynamicLoading(true);
    if (openWhenDone) {
      setAutoCompleteOpen(false);
    }
    try {
      const groups = await resolve(input);
      if (isStale()) {
        return;
      }
      setSearchResult(
        groups.map(({ title, options: groupOptions }) => ({
          label: <span data-title="category-title">{title}</span>,
          titleText: title,
          options: groupOptions.map((option, index) => ({
            key: index,
            label: (
              <DynamicModeLabel
                option={option}
                icon={activeMode?.icon ?? faLocationDot}
                svgIcon={activeMode?.svgIcon}
              />
            ),
            value: option.value,
            sData: null as any,
            dynamicOption: option,
          })),
        }))
      );
      setOptions([]);
      if (openWhenDone) {
        setTimeout(() => {
          setAutoCompleteOpen(true);
          autoCompleteRef.current?.focus();
        }, 0);
      }
    } catch (error) {
      if (isStale()) {
        return;
      }
      console.warn("[SEARCH] dynamic mode failed", error);
      setSearchResult([]);
      setOptions([]);
    } finally {
      if (!isStale()) {
        setDynamicLoading(false);
      }
    }
  };

  const valueRef = useRef(value);
  valueRef.current = value;
  const runDynamicSearchRef = useRef(runDynamicSearch);
  runDynamicSearchRef.current = runDynamicSearch;

  const activeModeSubscribe = activeMode?.subscribe;
  useEffect(() => {
    if (!isDynamicMode || !activeModeSubscribe) {
      return;
    }
    return activeModeSubscribe((options) => {
      const nextInput = options?.input ?? valueRef.current;
      if (options?.input !== undefined) {
        setValue(options.input);
      }
      void runDynamicSearchRef.current(nextInput, {
        openWhenDone: options?.open,
      });
    });
  }, [isDynamicMode, activeModeSubscribe]);

  const handleSearchInput = (value: string) => {
    if (isDynamicMode) {
      void runDynamicSearch(value);
    } else if (searchMode === PARCEL_MODE && landParcelData) {
      handleParcelSearch(value, landParcelData);
    } else {
      handleSearchAutoComplete(value);
    }
  };

  useEffect(() => {
    if (autoCompleteRef.current) {
      const childNodes = autoCompleteRef.current;
      autoCompleteRef.current.scrollTo(0);
    }
  }, [options]);

  const handleOnSelect = (option, skipMapMovement = false) => {
    const dynamicOption: DynamicSearchOption | undefined = option.dynamicOption;
    if (dynamicOption) {
      setValue(dynamicOption.value);
      if (dynamicOption.drilldown) {
        // same shape as the Gemarkung step, but the next stage may take a
        // while (a ranking, a map query): the dropdown would sit there showing
        // the stage that was just picked, so it is closed while the mode works
        // and opened again on the answer
        void runDynamicSearch(dynamicOption.value, { openWhenDone: true });
        return;
      }
      setCleanBtnDisable(false);
      dynamicOption.onPick?.();
      if (dynamicOption.item) {
        _onSelection(dynamicOption.item, skipMapMovement);
      }
      setTimeout(() => {
        btnClosRef.current?.focus();
      }, 100);
      return;
    }

    if (option.isLandParcel) {
      if (option.parcelStage === "gemarkung" || option.parcelStage === "flur") {
        setValue(option.value);
        handleSearchInput(option.value);
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
    if (activeGazData) {
      const allModifiedData = prepareGazData(
        activeGazData,
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
  }, [activeGazData, prepoHandling]);

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
    } else {
      setFuseInstance(null);
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
            if (nextMode === PARCEL_MODE) {
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
              setSearchMode(key);
              setValue("");
              setSearchResult([]);
              setOptions([]);
              // a dynamic mode starts with a list to pick from rather than
              // with something to type, so show it right away
              if (searchModes.find((mode) => mode.key === key)?.resolve) {
                setTimeout(() => {
                  setAutoCompleteOpen(true);
                  autoCompleteRef.current?.focus();
                }, 0);
              }
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
              (landParcelLoading && searchMode === PARCEL_MODE) ||
              (isDynamicMode && dynamicLoading) ? (
                <FontAwesomeIcon
                  icon={faSpinner}
                  spin
                  style={{ fontSize: "16px" }}
                />
              ) : cleanBtnDisable ? (
                <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <SearchModeIcon
                    icon={activeMode?.icon ?? faLocationDot}
                    svgIcon={activeMode?.svgIcon}
                    size={activeMode?.iconSize ?? 16}
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
          if (
            !isAdditionalMode &&
            landParcelData &&
            sepIdx > 0 &&
            cleanBtnDisable
          ) {
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
            showCategories || isDynamicMode
              ? searchResult.map(({ titleText, ...rest }) => rest)
              : options
          }
          style={{ width: "100%", borderTopLeftRadius: 0 }}
          onSearch={handleSearchInput}
          onChange={(value) => {
            if (autoCompleteRef?.current) {
              autoCompleteRef.current.scrollTo(0);
            }
            setValue(value);

            if (value === "") {
              if (isDynamicMode) {
                void runDynamicSearch("");
              } else if (isAdditionalMode && activeMode?.showAllOnFocus) {
                showAllActiveModeEntries();
              } else {
                setSearchResult([]);
              }
            }
          }}
          placeholder={
            searchMode === PARCEL_MODE && landParcelSearch
              ? `Gemarkung${LAND_PARCEL_SEPARATOR}Flur${LAND_PARCEL_SEPARATOR}Flurstück`
              : activeMode?.placeholder ?? placeholder
          }
          value={value}
          open={autoCompleteOpen}
          onDropdownVisibleChange={(visible) => {
            setAutoCompleteOpen(visible);
            if (visible && isDynamicMode && searchResult.length === 0) {
              void runDynamicSearch(value);
            } else if (
              visible &&
              value === "" &&
              searchMode === PARCEL_MODE &&
              landParcelData
            ) {
              const gemarkungOpts = generateGemarkungOptions(
                "",
                landParcelData
              );
              setSearchResult(gemarkungOpts);
              setOptions([]);
            } else if (
              visible &&
              value === "" &&
              isAdditionalMode &&
              activeMode?.showAllOnFocus
            ) {
              showAllActiveModeEntries();
            }
          }}
          onSelect={(value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          className={
            !isAdditionalMode &&
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
