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
import { useDispatch, useSelector } from "react-redux";

import { Save, useSelection, useShareUrl } from "@carma-apps/portals";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import { useOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";
import { selectViewerIsMode2d } from "@carma-mapping/cesium-engine";
import { useEffect } from "react";
import {
  appendSavedLayerConfig,
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getLayerState,
  getPaleOpacityValue,
  setFocusMode,
} from "../../store/slices/mapping";
import {
  changePrintError,
  getIfPopupOpend,
  getIsLoading,
  getPrintError,
} from "../../store/slices/print";
import {
  setShowResourceModal,
  setUIMode,
  setZenMode,
} from "../../store/slices/ui";
import ShareContent from "../ShareContent";
import Print from "../map-print/Print";
import CustomPopover from "./CustomPopover";

const disabledClass = "text-gray-300";
const disabledImageOpacity = "opacity-20";

const ActionButtons = () => {
  const dispatch = useDispatch();
  const layerState = useSelector(getLayerState);
  const { selection } = useSelection();
  const { copyShareUrl, contextHolder } = useShareUrl();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const focusMode = useSelector(getFocusMode);
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
      className="flex items-center gap-4 sm:gap-6 lg:ml-[86px] xl:ml-[190px]"
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
          className="h-[24.5px] min-w-fit"
          data-test-id="kartenebenen-hinzufügen-btn"
        >
          <img
            src={baseUrl + "icons/add-layers.png"}
            alt="Kartenebenen hinzufügen"
            className={`h-5 min-w-fit mb-0.5 cursor-pointer ${
              isMode2d ? "" : disabledImageOpacity
            }`}
          />
        </button>
      </Tooltip>
      <Tooltip
        title={`Hintergrundkarte ${focusMode ? "zurücksetzen" : "abschwächen"}`}
      >
        <button
          className="h-[24.5px] min-w-fit"
          disabled={!isMode2d}
          onClick={() => {
            dispatch(setFocusMode(!focusMode));
            dispatch(
              changeBackgroundOpacity({
                opacity: focusMode ? 1 : paleOpacityValue,
              })
            );
            if (focusMode) {
              dispatch(changeBackgroundVisibility(true));
            }
          }}
          data-test-id="hintergrundkarte-btn"
        >
          <img
            src={
              baseUrl +
              `${focusMode ? "icons/focus-on.png" : "icons/focus-off.png"}`
            }
            alt="Kartenebenen hinzufügen"
            className={`h-5 min-w-fit mb-0.5 cursor-pointer ${
              isMode2d ? "" : disabledImageOpacity
            }`}
          />
        </button>
      </Tooltip>
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
          onClick={() => {
            dispatch(setZenMode(true));
            dispatch(setUIMode("default"));
          }}
          data-test-id="zen-mode-btn"
        >
          <FontAwesomeIcon fixedWidth={true} icon={faEye} />
        </button>
      </Tooltip>
      <CustomPopover
        content={
          <Save
            layers={activeLayers}
            backgroundLayer={backgroundLayer}
            storeConfigAction={(config) =>
              dispatch(appendSavedLayerConfig(config))
            }
          />
        }
        icon={faFileExport}
        testId="speichern-btn"
        tooltip="Karte speichern"
        disabled={!isMode2d}
      />
      <CustomPopover
        content={<Print />}
        icon={printError ? faExclamation : faPrint}
        testId="print-btn"
        tooltip={printError ? printError : "Drucken"}
        disabled={!isMode2d}
        className={printError ? "text-red-600" : ""}
      />
      <CustomPopover
        content={<ShareContent />}
        icon={faShareNodes}
        testId="teilen-btn"
        tooltip="Teilen"
        shiftClickHandler={() => {
          copyShareUrl({
            layerState,
            selection,
          });
        }}
      />
      {contextHolder}
    </div>
  );
};

export default ActionButtons;
