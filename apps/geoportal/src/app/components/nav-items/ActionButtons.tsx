import {
  faExclamation,
  faEye,
  faEyeSlash,
  faFileExport,
  faPrint,
  faRotateRight,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Popover, Tooltip } from "antd";
import { useDispatch, useSelector } from "react-redux";

import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import { useOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";
import { Save } from "@carma-apps/portals";
import { selectViewerIsMode2d } from "@carma-mapping/cesium-engine";
import {
  appendSavedLayerConfig,
  changeBackgroundOpacity,
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getPaleOpacityValue,
  setFocusMode,
} from "../../store/slices/mapping";
import {
  getUIShowLayerButtons,
  setShowResourceModal,
  setUIShowLayerButtons,
} from "../../store/slices/ui";
import ShareContent from "../ShareContent";
import Print from "../map-print/Print";
import { useEffect, useState } from "react";
import {
  changeIfPopupOpend,
  changePrintError,
  getIfPopupOpend,
  getIsLoading,
  getPrintError,
} from "../../store/slices/print";

const disabledClass = "text-gray-300";
const disabledImageOpacity = "opacity-20";

const ActionButtons = () => {
  const dispatch = useDispatch();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const focusMode = useSelector(getFocusMode);
  const showLayerButtons = useSelector(getUIShowLayerButtons);
  const activeLayers = useSelector(getLayers);
  const showPrintPopup = useSelector(getIfPopupOpend);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const paleOpacityValue = useSelector(getPaleOpacityValue);

  const baseUrl = window.location.origin + window.location.pathname;

  const menuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENULEISTE", geoElements)
  );

  const loading = useSelector(getIsLoading);
  const printError = useSelector(getPrintError);

  const handlerSetShowPrintPopup = (newState) => {
    dispatch(changeIfPopupOpend(newState));
  };

  useEffect(() => {
    if (printError) {
      const timer = setTimeout(() => {
        dispatch(changePrintError(null));
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [printError]);

  return (
    <div
      ref={menuTourRef}
      className="flex items-center gap-6 lg:ml-[86px] xl:ml-[190px]"
    >
      <Tooltip title="Aktualisieren">
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="text-xl hover:text-gray-600"
          data-test-id="reload-btn"
        >
          <FontAwesomeIcon icon={faRotateRight} />
        </button>
      </Tooltip>
      <Tooltip title="Karteninhalte hinzufügen">
        <button
          disabled={!isMode2d}
          onClick={() => {
            dispatch(setShowResourceModal(true));
          }}
          className="h-[24.5px]"
          data-test-id="kartenebenen-hinzufügen-btn"
        >
          <img
            src={baseUrl + "icons/add-layers.png"}
            alt="Kartenebenen hinzufügen"
            className={`h-5 mb-0.5 cursor-pointer ${
              isMode2d ? "" : disabledImageOpacity
            }`}
          />
        </button>
      </Tooltip>
      <Tooltip
        title={`Hintergrundkarte ${focusMode ? "zurücksetzen" : "abschwächen"}`}
      >
        <button
          className="h-[24.5px]"
          disabled={!isMode2d}
          onClick={() => {
            dispatch(setFocusMode(!focusMode));
            dispatch(
              changeBackgroundOpacity({
                opacity: focusMode ? 1 : paleOpacityValue,
              })
            );
          }}
          data-test-id="hintergrundkarte-btn"
        >
          <img
            src={
              baseUrl +
              `${focusMode ? "icons/focus-on.png" : "icons/focus-off.png"}`
            }
            alt="Kartenebenen hinzufügen"
            className={`h-5 mb-0.5 cursor-pointer ${
              isMode2d ? "" : disabledImageOpacity
            }`}
          />
        </button>
      </Tooltip>
      <Tooltip
        title={`Kartensteuerelemente ${
          showLayerButtons ? "ausblenden" : "einblenden"
        }`}
      >
        <button
          className={`text-xl ${
            isMode2d ? "hover:text-gray-600" : disabledClass
          }`}
          disabled={!isMode2d}
          onClick={() => {
            dispatch(setUIShowLayerButtons(!showLayerButtons));
          }}
          data-test-id="kartensteuerelemente-btn"
        >
          <FontAwesomeIcon
            fixedWidth={true}
            icon={showLayerButtons ? faEye : faEyeSlash}
          />
        </button>
      </Tooltip>
      <Tooltip title="Speichern">
        <Popover
          trigger="click"
          placement="bottom"
          content={
            <Save
              layers={activeLayers}
              backgroundLayer={backgroundLayer}
              storeConfigAction={(config) =>
                dispatch(appendSavedLayerConfig(config))
              }
            />
          }
        >
          <button
            className={` text-xl ${
              isMode2d ? "hover:text-gray-600" : disabledClass
            }`}
            data-test-id="speichern-btn"
          >
            <FontAwesomeIcon icon={faFileExport} />
          </button>
        </Popover>
      </Tooltip>
      <Tooltip title={printError ? printError : "Drucken"}>
        <Popover
          trigger="click"
          placement="bottom"
          content={<Print setShowPrintPopup={handlerSetShowPrintPopup} />}
          open={showPrintPopup && isMode2d}
        >
          {!printError ? (
            <FontAwesomeIcon
              onClick={() => {
                if (!isMode2d) {
                  return;
                }
                handlerSetShowPrintPopup(true);
              }}
              icon={faPrint}
              className={`text-xl ${
                isMode2d ? "hover:text-gray-600 cursor-pointer" : disabledClass
              }`}
            />
          ) : (
            <FontAwesomeIcon
              onClick={() => {
                if (!isMode2d) {
                  return;
                }
                handlerSetShowPrintPopup(true);
              }}
              icon={faExclamation}
              className="text-xl text-red-600 cursor-pointer"
            />
          )}
        </Popover>
      </Tooltip>
      <Tooltip title="Teilen">
        <Popover trigger="click" placement="bottom" content={<ShareContent />}>
          <button
            className="hover:text-gray-600 text-xl"
            data-test-id="teilen-btn"
          >
            <FontAwesomeIcon icon={faShareNodes} />
          </button>
        </Popover>
      </Tooltip>
    </div>
  );
};

export default ActionButtons;
