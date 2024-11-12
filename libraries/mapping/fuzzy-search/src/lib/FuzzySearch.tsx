import { useEffect, useState, useRef, RefObject } from "react";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { AutoComplete, Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import type { BaseSelectRef } from "rc-select";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";
import IconComp from "react-cismap/commons/Icon";

import {
  EntityData,
  ModelAsset,
  removeCesiumMarker,
  removeGroundPrimitiveById,
} from "@carma-mapping/cesium-engine";

import { carmaHitTrigger } from "./utils/carmaHitTrigger";
import {
  generateOptions,
  limitSearchResult,
  mapDataToSearchResult,
  prepareGazData,
  removeStopwords,
  getDefaultSearchConfig,
} from "./utils/fuzzySearchHelper";

import {
  SearchResultItem,
  SearchGazetteerProps,
  Option,
  GruppedOptions,
  MapConsumer,
  SELECTED_POLYGON_ID,
  INVERTED_SELECTED_POLYGON_ID,
} from "..";
import { stopwords as stopwordsDe } from "./config/stopwords.de-de";

import "./fuzzy-search.css";
import { TerrainProvider, Viewer } from "cesium";

interface FuseWithOption<T> extends Fuse<T> {
  options?: IFuseOptions<T>;
}

// as used for marker creation and fuzzy search
export type CesiumOptions = {
  viewerRef: RefObject<Viewer>;
  markerAsset: ModelAsset;
  isPrimaryStyle: boolean;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
  terrainProviderRef?: RefObject<TerrainProvider>;
  surfaceProviderRef?: RefObject<TerrainProvider>;
};


export function LibFuzzySearch({
  gazData,
  setGazetteerHit,
  // gazetteerHit,
  // overlayFeature,
  mapRef,
  setOverlayFeature,
  referenceSystem,
  referenceSystemDefinition,
  stopwords = stopwordsDe,
  pixelwidth = 300,
  ifShowCategories: standardSearch = false,
  placeholder = "Wohin?",
  config = {
    prepoHandling: false,
    ifShowScore: false,
    limit: 3,
    cut: 0.4,
    distance: 100,
    threshold: 0.5,
  },
  cesiumOptions,
}: SearchGazetteerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [showCategories, setShowCategories] = useState(standardSearch);
  const { prepoHandling, ifShowScore, limit, cut, distance, threshold } =
    getDefaultSearchConfig(config);
  const inputStyle = {
    width: "calc(100% - 32px)",
    borderTopLeftRadius: 0,
  };
  const autoCompleteRef = useRef<BaseSelectRef | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  let mapConsumers: MapConsumer[] = [];
  //mapRef && mapConsumers.push(mapRef);
  cesiumOptions.viewerRef && mapConsumers.push(cesiumOptions.viewerRef);

  const topicMapGazetteerHitTrigger = (hit) => {
    builtInGazetteerHitTrigger(
      hit,
      mapRef.current
        ? mapRef.current.leafletMap.leafletElement
        : mapRef.leafletMap.leafletElement,
      referenceSystem,
      referenceSystemDefinition,
      setGazetteerHit,
      setOverlayFeature
      // _gazetteerHitTrigger,
    );
  };
  const [fuseInstance, setFuseInstance] =
    useState<FuseWithOption<SearchResultItem> | null>(null);
  const [searchResult, setSearchResult] = useState<GruppedOptions[]>([]);
  const [allGazeteerData, setAllGazeteerData] = useState([]);
  const hasGazData = allGazeteerData.length > 0;
  const [value, setValue] = useState("");
  const [cleanBtnDisable, setCleanBtnDisable] = useState(true);
  const [fireScrollEvent, setFireScrollEvent] = useState(null);
  //const [cesiumMarkerModel, setCesiumMarkerModel] = useState<Model | null>(null); // TODO reuse parsed Model
  const [selectedCesiumEntityData, setSelectedCesiumEntityData] =
    useState<EntityData | null>(null);

  const handleSearchAutoComplete = (value) => {
    if (fuseInstance) {
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

      if (!showCategories) {
        setOptions(generateOptions(resultWithRoundScore, ifShowScore));
      } else {
        const groupedResults = mapDataToSearchResult(result);
        setSearchResult(groupedResults);
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
    console.info(
      "[SEARCH] selected option",
      option,
      mapRef,
      cesiumOptions,
      mapConsumers
    );
    topicMapGazetteerHitTrigger([option.sData]); // TODO remove this after carma gazetteer hit trigger also handles LeafletMaps
    carmaHitTrigger([option.sData], mapConsumers, {
      cesiumOptions,
      selectedCesiumEntityData,
      setSelectedCesiumEntityData,
    });
    if (option.sData.type === "bezirke" || option.sData.type === "quartiere") {
      setGazetteerHit(null);
    } else {
      setGazetteerHit(option.sData);
    }
  };

  useEffect(() => {
    if (gazData) {
      console.debug("HOOK: gazData provided");
      if (gazData.length > 0) { 
        const allModifiedData = prepareGazData(gazData, prepoHandling);
        setAllGazeteerData(allModifiedData);
      } else {
        console.debug("HOOK: gazData empty");
        setAllGazeteerData([]);
      }
    } else {
      console.debug("HOOK: gazData not available");
    }
  }, [gazData, prepoHandling]);

  useEffect(() => {
    if (!fuseInstance ) {
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
  }, [fuseInstance, allGazeteerData, distance, threshold]);

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

      if (
        inputElement &&
        antdDrapdownSelect &&
        listHolder instanceof HTMLElement
      ) {
        const inputWidth = inputElement.scrollWidth;

        if (holderInner instanceof HTMLElement) {
          holderInner.style.width = inputWidth + 10 + "px";

          const handleScroll = (event) => {
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

  const handleOnClickClean = () => {
    {
      setGazetteerHit(null);
      setValue("");
      setOptions([]);
      setSearchResult([]);
      setOverlayFeature(null);
      setCleanBtnDisable(true);
      if (cesiumOptions) {
        selectedCesiumEntityData &&
          removeCesiumMarker(cesiumOptions.viewer, selectedCesiumEntityData);
        setSelectedCesiumEntityData(null);
        cesiumOptions.viewer.entities.removeById(SELECTED_POLYGON_ID);
        removeGroundPrimitiveById(
          cesiumOptions.viewer,
          INVERTED_SELECTED_POLYGON_ID
        );
        cesiumOptions.viewer.scene.requestRender(); // explicit render for requestRenderMode;
      }
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
                // color: '#1d93d4',
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
        onClick={handleOnClickClean}
        disabled={cleanBtnDisable}
      />
      {!showCategories ? (
        <AutoComplete
          ref={autoCompleteRef}
          options={options}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          onChange={(value) => setValue(value)}
          placeholder={placeholder}
          value={value}
          dropdownAlign={{
            offset: [0, 4],
          }}
          onSelect={(value, option) => handleOnSelect(option)}
          defaultActiveFirstOption={true}
          dropdownRender={
            (item) => {
            return (
              <div className="fuzzy-dropdownwrapper" ref={dropdownContainerRef}>
                {allGazeteerData.length === 0 ? "empty" : item}
              </div>
            );
          }}
        />
      ) : (
        <AutoComplete
          popupClassName="certain-category-search-dropdown"
          popupMatchSelectWidth={500}
          dropdownAlign={{
            offset: [0, 4],
          }}
          style={inputStyle}
          onSearch={(value) => handleSearchAutoComplete(value)}
          placeholder={placeholder}
          placement="bottomLeft"
          options={searchResult}
          onSelect={(value, option) => handleOnSelect(option)}
          value={value}
          onChange={(value) => setValue(value)}
        ></AutoComplete>
      )}
    </div>
  );
}
