import { useState, useRef, useEffect, useMemo } from "react";
import { AutoComplete, Button, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faTimes,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { BaseSelectRef } from "rc-select";

import { useGazData } from "@carma-appframeworks/portals";
import { GroupedOptions, Option, SearchResultItem } from "..";
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
import type { LandParcelParseState } from "./utils/landParcelSearchHelper";

import "./fuzzy-search.css";

export type ParcelChangeInfo = {
  gemarkung: string;
  flur: string;
  fstck: string;
};

/** What `transformOptions` gets: the input, how far it parsed, what matched. */
export type LandParcelOptionsContext = {
  input: string;
  parseState: LandParcelParseState;
  hasResults: boolean;
};

export type LandParcelSearchProps = {
  onSelection?: (hit: SearchResultItem | null) => void;
  onParcelChange?: (info: ParcelChangeInfo | null) => void;
  pixelwidth?: number | string;
  placeholder?: string;
  landParcelData?: LandParcelDataStructure;
  showDropdownBelow?: boolean;
  showButton?: boolean;
  defaultValue?: string;
  /** Controlled input text; the component then keeps none of its own. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Last word on the dropdown: filter the options, or add entries of your own. */
  transformOptions?: (
    groups: GroupedOptions[],
    context: LandParcelOptionsContext
  ) => GroupedOptions[];
  /** The picked option, including entries added by `transformOptions`. */
  onOptionSelect?: (option: Option) => void;
  /** Replaces the default "Kein Flurstück gefunden" toast. */
  onNotFound?: (input: string) => void;
  /** Greys out the Gemarkung and Flur while typing; off for one plain text style. */
  dimPrefix?: boolean;
};

const defaultIcon = (
  <FontAwesomeIcon
    icon={faDrawPolygon}
    style={{
      fontSize: "16px",
    }}
  />
);

export function LandParcelSearch({
  onSelection,
  onParcelChange,
  pixelwidth = 300,
  placeholder = `Gemarkung${LAND_PARCEL_SEPARATOR}Flur${LAND_PARCEL_SEPARATOR}Flurstück`,
  landParcelData: externalData,
  showDropdownBelow = false,
  showButton = true,
  defaultValue,
  value: controlledValue,
  onValueChange,
  transformOptions,
  onOptionSelect,
  onNotFound,
  dimPrefix = true,
}: LandParcelSearchProps) {
  const [searchResult, setSearchResult] = useState<GroupedOptions[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [innerValue, setInnerValue] = useState(defaultValue ?? "");
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : innerValue;
  const setValue = (next: string) => {
    if (!isControlled) {
      setInnerValue(next);
    }
    onValueChange?.(next);
  };
  const [cleanBtnDisable, setCleanBtnDisable] = useState(!defaultValue);
  const [autoCompleteOpen, setAutoCompleteOpen] = useState(false);

  const btnClosRef = useRef<HTMLButtonElement>(null);
  const autoCompleteRef = useRef<BaseSelectRef | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const {
    landParcelData: hookedLandParcelData,
    landParcelLoading,
    loadLandParcelData,
  } = useGazData();

  const landParcelData =
    externalData ??
    (hookedLandParcelData as LandParcelDataStructure | undefined);

  const triggerPreload = () => {
    if (!externalData && !hookedLandParcelData && !landParcelLoading) {
      loadLandParcelData();
    }
  };

  // Sync value when defaultValue changes from outside
  useEffect(() => {
    if (isControlled) {
      return;
    }
    if (defaultValue != null) {
      setInnerValue(defaultValue);
      setCleanBtnDisable(!defaultValue);
    }
  }, [defaultValue]);

  // Load data immediately on mount
  useEffect(() => {
    triggerPreload();
  }, []);

  // When data arrives while dropdown is open, populate gemarkung list
  useEffect(() => {
    if (landParcelData && autoCompleteOpen && value === "") {
      const gemarkungOpts = generateGemarkungOptions("", landParcelData);
      setSearchResult(gemarkungOpts);
      setOptions([]);
    }
  }, [landParcelData]);

  const notifyNotFound = (input: string) => {
    if (onNotFound) {
      onNotFound(input);
      return;
    }
    message.warning("Kein Flurstück gefunden");
  };

  const handleSearch = (searchValue: string) => {
    if (!landParcelData) return;

    if (searchValue.includes(LAND_PARCEL_SEPARATOR)) {
      const directMatch = tryDirectLandParcelMatch(searchValue, landParcelData);
      if (directMatch) {
        setSearchResult(directMatch);
        setOptions([]);
        return;
      }

      const parseState = parseLandParcelInput(searchValue, landParcelData);
      if (parseState.stage !== "none") {
        const parcelOptions = generateLandParcelOptions(
          parseState,
          landParcelData
        );
        const hasResults = parcelOptions.some((g) => g.options.length > 0);
        if (
          !hasResults &&
          parseState.stage === "flur_matched" &&
          parseState.fstckFilter !== ""
        ) {
          notifyNotFound(searchValue);
        }
        setSearchResult(parcelOptions);
        setOptions([]);
      } else {
        const segments = searchValue.split(LAND_PARCEL_SEPARATOR);
        if (segments.length >= 3 && segments[2].trim() !== "") {
          notifyNotFound(searchValue);
        }
        setSearchResult([]);
        setOptions([]);
      }
    } else {
      const compactMatch = tryDirectLandParcelMatch(
        searchValue,
        landParcelData
      );
      if (compactMatch) {
        setSearchResult(compactMatch);
        setOptions([]);
      } else if (normalizeLandParcelInput(searchValue) !== null) {
        notifyNotFound(searchValue);
        setSearchResult([]);
        setOptions([]);
      } else {
        const gemarkungOpts = generateGemarkungOptions(
          searchValue,
          landParcelData
        );
        setSearchResult(gemarkungOpts);
        setOptions([]);
      }
    }
  };

  const handleOnSelect = (option: any) => {
    // added options carry a stage none of the branches below handles
    onOptionSelect?.(option);

    if (option.parcelStage === "gemarkung" || option.parcelStage === "flur") {
      setValue(option.value);
      handleSearch(option.value);
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
      if (selectionItem && onSelection) {
        onSelection(selectionItem);
      }

      if (onParcelChange && option.parcelData) {
        onParcelChange({
          gemarkung: option.parcelData.gemarkung,
          flur: option.parcelData.flur,
          fstck: option.parcelData.label,
        });
      }

      setTimeout(() => {
        btnClosRef.current?.focus();
      }, 100);
    }
  };

  const handleClear = () => {
    setValue("");
    setOptions([]);
    setSearchResult([]);
    setCleanBtnDisable(true);
    onSelection?.(null);
    onParcelChange?.(null);
  };

  const dropdownAlign = showDropdownBelow
    ? {
        points: ["tl", "bl"],
        offset: [0, 4],
        overflow: { adjustX: false, adjustY: false },
      }
    : {
        points: ["bl", "tl"],
        offset: [0, -4],
        overflow: { adjustX: false, adjustY: false },
      };

  const isLoading = !externalData && landParcelLoading;
  const showOverlay = dimPrefix && Boolean(landParcelData) && cleanBtnDisable;

  // parsed again rather than remembered, so the transform sees the current text
  const displayedOptions = useMemo(() => {
    if (!transformOptions) {
      return searchResult;
    }
    const parseState: LandParcelParseState = landParcelData
      ? parseLandParcelInput(value, landParcelData)
      : { stage: "none" };
    return transformOptions(searchResult, {
      input: value,
      parseState,
      hasResults: searchResult.some(
        (group) => (group.options ?? []).length > 0
      ),
    });
  }, [transformOptions, searchResult, value, landParcelData]);

  return (
    <div
      data-test-id="land-parcel-search"
      style={{
        width: pixelwidth,
        display: "flex",
      }}
      className="fuzzy-search-container"
    >
      {showButton && (
        <Button
          ref={btnClosRef}
          icon={
            isLoading ? (
              <FontAwesomeIcon
                icon={faSpinner}
                spin
                style={{ fontSize: "16px" }}
              />
            ) : cleanBtnDisable ? (
              defaultIcon
            ) : (
              <FontAwesomeIcon style={{ fontSize: "16px" }} icon={faTimes} />
            )
          }
          className="clear-fuzzy-button clear-fuzzy-button__active"
          onClick={cleanBtnDisable ? undefined : handleClear}
        />
      )}
      <div style={{ position: "relative", width: "calc(100% - 32px)" }}>
        {(() => {
          const sepIdx = value.lastIndexOf(LAND_PARCEL_SEPARATOR);
          if (showOverlay && sepIdx > 0) {
            const prefix = value.substring(0, sepIdx + 1);
            const active = value.substring(sepIdx + 1);
            return (
              <div aria-hidden="true" className="fuzzy-input-overlay">
                <span className="fuzzy-input-overlay__lead">{prefix}</span>
                <span className="fuzzy-input-overlay__value">{active}</span>
              </div>
            );
          }
          return null;
        })()}
        <AutoComplete
          ref={autoCompleteRef}
          dropdownAlign={dropdownAlign}
          options={displayedOptions.map(({ titleText, ...rest }) => rest)}
          style={{ width: "100%", borderTopLeftRadius: 0 }}
          onSearch={handleSearch}
          onChange={(val) => {
            if (autoCompleteRef?.current) {
              autoCompleteRef.current.scrollTo(0);
            }
            setValue(val);
            if (val === "") {
              setSearchResult([]);
            }
          }}
          placeholder={placeholder}
          value={value}
          open={autoCompleteOpen}
          onDropdownVisibleChange={(visible) => {
            setAutoCompleteOpen(visible);
            if (visible) {
              triggerPreload();
              if (value === "" && landParcelData) {
                const gemarkungOpts = generateGemarkungOptions(
                  "",
                  landParcelData
                );
                setSearchResult(gemarkungOpts);
                setOptions([]);
              } else if (value && landParcelData) {
                handleSearch(value);
              }
            }
          }}
          onSelect={(_value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          className={
            showOverlay && value.includes(LAND_PARCEL_SEPARATOR)
              ? "fuzzy-input-transparent"
              : ""
          }
          dropdownRender={(item) => (
            <div className="fuzzy-dropdownwrapper" ref={dropdownContainerRef}>
              {item}
            </div>
          )}
        />
      </div>
    </div>
  );
}
