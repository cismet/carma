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
  getFocusMode,
  getLayers,
  setFocusMode,
} from "../../store/slices/mapping";
import {
  getUIShowLayerButtons,
  setShowResourceModal,
  setUIShowLayerButtons,
} from "../../store/slices/ui";
import ShareContent from "../ShareContent";
import Print from "../map-print/Print";
import { useState } from "react";
import { getIsLoading, getPrintError } from "../../store/slices/print";

const disabledClass = "text-gray-300";
const disabledImageOpacity = "opacity-20";

const ActionButtons = () => {
  const dispatch = useDispatch();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const focusMode = useSelector(getFocusMode);
  const showLayerButtons = useSelector(getUIShowLayerButtons);
  const activeLayers = useSelector(getLayers);

  const baseUrl = window.location.origin + window.location.pathname;

  const menuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENULEISTE", geoElements)
  );

  const [showPrintPopup, setShowPrintPopup] = useState(false);
  const loading = useSelector(getIsLoading);
  const printError = useSelector(getPrintError);

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
          className={`text-xl hover:text-gray-600 ${
            isMode2d ? "" : disabledClass
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
              storeConfigAction={(config) =>
                dispatch(appendSavedLayerConfig(config))
              }
            />
          }
        >
          <button
            className={`hover:text-gray-600 text-xl ${
              isMode2d ? "" : disabledClass
            }`}
            data-test-id="speichern-btn"
          >
            <FontAwesomeIcon icon={faFileExport} />
          </button>
        </Popover>
      </Tooltip>
      <Tooltip title="Drucken">
        <Popover
          trigger="click"
          placement="bottom"
          content={<Print setShowPrintPopup={setShowPrintPopup} />}
          open={showPrintPopup}
        >
          {!printError ? (
            <FontAwesomeIcon
              onClick={() => setShowPrintPopup(true)}
              icon={faPrint}
              className="text-xl hover:text-gray-600 cursor-pointer"
            />
          ) : (
            <FontAwesomeIcon
              onClick={() => setShowPrintPopup(true)}
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
