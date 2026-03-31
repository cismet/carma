import { useState, useRef, useEffect } from "react";
import { AutoComplete, Button, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faTimes,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { BaseSelectRef } from "rc-select";

import { useGazData } from "@carma-appframeworks/portals";
import type { SearchResultItem } from "@carma/types";
import { GroupedOptions, Option } from "..";
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

import "./fuzzy-search.css";

export type ParcelChangeInfo = {
  gemarkung: string;
  flur: string;
  fstck: string;
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
}: LandParcelSearchProps) {
  const [searchResult, setSearchResult] = useState<GroupedOptions[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [value, setValue] = useState(defaultValue ?? "");
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
    if (defaultValue != null) {
      setValue(defaultValue);
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
          message.warning("Kein Flurstück gefunden");
        }
        setSearchResult(parcelOptions);
        setOptions([]);
      } else {
        const segments = searchValue.split(LAND_PARCEL_SEPARATOR);
        if (segments.length >= 3 && segments[2].trim() !== "") {
          message.warning("Kein Flurstück gefunden");
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
        message.warning("Kein Flurstück gefunden");
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
          options={searchResult.map(({ titleText, ...rest }) => rest)}
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
            value.includes(LAND_PARCEL_SEPARATOR) &&
            landParcelData &&
            cleanBtnDisable
              ? "parcel-input-transparent"
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
