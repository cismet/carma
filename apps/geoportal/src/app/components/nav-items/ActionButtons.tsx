import {
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

const disabledClass = "text-gray-300";
const disabledImageOpacity = "opacity-20";

const ActionButtons = () => {
  const dispatch = useDispatch();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const focusMode = useSelector(getFocusMode);
  const showLayerButtons = useSelector(getUIShowLayerButtons);
  const activeLayers = useSelector(getLayers);

  const baseUrl = window.location.origin + window.location.pathname;

  return (
    <div className="flex items-center gap-6">
      <Tooltip title="Aktualisieren">
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="text-xl hover:text-gray-600"
        >
          <FontAwesomeIcon icon={faRotateRight} />
        </button>
      </Tooltip>
      <Tooltip title="Kartenebenen hinzufügen">
        <button
          disabled={!isMode2d}
          onClick={() => {
            dispatch(setShowResourceModal(true));
          }}
          className="h-[24.5px]"
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
          >
            <FontAwesomeIcon icon={faFileExport} />
          </button>
        </Popover>
      </Tooltip>
      <Tooltip title="Drucken">
        <FontAwesomeIcon icon={faPrint} className="text-xl text-gray-300" />
      </Tooltip>
      <Tooltip title="Teilen">
        <Popover trigger="click" placement="bottom" content={<ShareContent />}>
          <button className="hover:text-gray-600 text-xl">
            <FontAwesomeIcon icon={faShareNodes} />
          </button>
        </Popover>
      </Tooltip>
    </div>
  );
};

export default ActionButtons;
