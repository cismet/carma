// @ts-nocheck
// TODO fix typescript for strict mode
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  faExclamation,
  faEye,
  faFileExport,
  faPrint,
  faRotateRight,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { Save, useSelection, useShareUrl } from "@carma-appframeworks/portals";
import { EngineAvailability } from "../../utils/mapEngineAvailability";
import { EngineAwareButton } from "../common/EngineAwareButton";
import { EngineAwarePopover } from "../common/EngineAwarePopover";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import { useOverlayHelper } from "@carma-commons/ui/helper-overlay";
import { carmaWindow } from "@carma-commons/dom/window";
import {
  appendSavedLayerConfig,
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  getFocusMode,
  getLayers,
  getLayerState,
  getPaleOpacityValue,
  setFocusMode,
  getBackgroundLayer,
} from "../../store/slices/mapping";
import {
  setZenMode,
  setShowResourceModal,
  setUIMode,
} from "../../store/slices/ui";
import Print from "../map-print/Print";
import ShareContent from "../ShareContent";
import CustomPopover from "./CustomPopover";

const disabledClass = "text-gray-300";
const disabledImageOpacity = "opacity-20";

const ActionButtons = () => {
  const dispatch = useDispatch();
  const layerState = useSelector(getLayerState);
  const { selection } = useSelection();
  const { copyShareUrl, contextHolder } = useShareUrl();
  const focusMode = useSelector(getFocusMode);
  const activeLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const paleOpacityValue = useSelector(getPaleOpacityValue);

  const baseUrl = window.location.origin + window.location.pathname;

  const menuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENULEISTE", geoElements)
  );

  const handleAddLayers = useCallback(() => {
    dispatch(setShowResourceModal(true));
  }, [dispatch]);

  const handleToggleFocusMode = useCallback(() => {
    dispatch(setFocusMode(!focusMode));
    dispatch(
      changeBackgroundOpacity({
        opacity: focusMode ? 1 : paleOpacityValue,
      })
    );
    if (focusMode) {
      dispatch(changeBackgroundVisibility(true));
    }
  }, [dispatch, focusMode, paleOpacityValue]);

  const handleZenMode = useCallback(() => {
    dispatch(setZenMode(true));
    dispatch(setUIMode("default"));
  }, [dispatch]);

  const handleSaveConfig = useCallback(
    (config) => {
      dispatch(appendSavedLayerConfig(config));
    },
    [dispatch]
  );

  const handleShareUrl = useCallback(() => {
    copyShareUrl({
      layerState,
      selection,
    });
  }, [copyShareUrl, layerState, selection]);

  const saveContent = (
    <Save
      layers={activeLayers}
      backgroundLayer={backgroundLayer}
      storeConfigAction={handleSaveConfig}
    />
  );

  const printContent = <Print />;

  const shareContent = <ShareContent />;

  return (
    <div
      ref={menuTourRef}
      className="flex items-center gap-4 sm:gap-6 lg:ml-[86px] xl:ml-[190px]"
    >
      <Tooltip title="Aktualisieren">
        <button
          onClick={carmaWindow.location.reload}
          className="text-xl hover:text-gray-600"
          data-test-id="reload-btn"
        >
          <FontAwesomeIcon icon={faRotateRight} />
        </button>
      </Tooltip>
      <EngineAwareButton
        tooltip="Karteninhalte hinzufügen"
        availableOn={EngineAvailability.LEAFLET_2D}
        onClick={handleAddLayers}
        testId="kartenebenen-hinzufügen-btn"
        className="h-[24.5px] min-w-fit"
        disabledClassName={disabledImageOpacity}
      >
        <img
          src={baseUrl + "icons/add-layers.png"}
          alt="Kartenebenen hinzufügen"
          className="h-5 min-w-fit mb-0.5 cursor-pointer"
        />
      </EngineAwareButton>
      <EngineAwareButton
        tooltip={`Hintergrundkarte ${focusMode ? "zurücksetzen" : "abschwächen"}`}
        availableOn={EngineAvailability.LEAFLET_2D}
        onClick={handleToggleFocusMode}
        testId="hintergrundkarte-btn"
        className="h-[24.5px] min-w-fit"
        disabledClassName={disabledImageOpacity}
      >
        <img
          src={
            baseUrl +
            `${focusMode ? "icons/focus-on.png" : "icons/focus-off.png"}`
          }
          alt="Hintergrundkarte"
          className="h-5 min-w-fit mb-0.5 cursor-pointer"
        />
      </EngineAwareButton>
      <Tooltip
        title={
          <span>
            Bedienelemente ausblenden
            <br />
            (Zen-Modus starten)
          </span>
        }
      >
        <button
          className={`text-xl hover:text-gray-600`}
          onClick={handleZenMode}
          data-test-id="zen-mode-btn"
        >
          <FontAwesomeIcon fixedWidth={true} icon={faEye} />
        </button>
      </Tooltip>
      <EngineAwarePopover
        content={saveContent}
        icon={faFileExport}
        testId="speichern-btn"
        tooltip="Karte speichern"
        availableOn={EngineAvailability.LEAFLET_2D}
      />
      <EngineAwarePopover
        content={printContent}
        icon={faPrint}
        testId="print-btn"
        tooltip="Drucken"
        availableOn={EngineAvailability.LEAFLET_2D}
      />
      <CustomPopover
        content={shareContent}
        icon={faShareNodes}
        testId="teilen-btn"
        tooltip="Teilen"
        shiftClickHandler={handleShareUrl}
      />
      {contextHolder}
    </div>
  );
};

export default ActionButtons;
