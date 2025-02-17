import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faBars, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio, Tooltip } from "antd";
import { useContext } from "react";
import { useDispatch, useSelector } from "react-redux";

import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import { useOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";
import {
  selectViewerIsMode2d,
  setCurrentSceneStyle,
} from "@carma-mapping/cesium-engine";

import {
  getBackgroundLayer,
  getSelectedLayerIndex,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setSelectedLayerIndex,
} from "../store/slices/mapping";
import ActionButtons from "./nav-items/ActionButtons";

import { useCarmaMapContext } from "@carma-apps/portals";
import ResourceModal from "./nav-items/ResourceModal";
import "./switch.css";
import { getZenMode } from "../store/slices/ui";

const TopNavbar = () => {
  const dispatch = useDispatch();

  const { setShowTourOverlay } = useCarmaMapContext();

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const isMode2d = useSelector(selectViewerIsMode2d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const zenMode = useSelector(getZenMode);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);

  const hintergrundTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("HINTERGRUND", geoElements)
  );
  const modalMenuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENU", geoElements)
  );
  const helpOverlayTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("HILFE_OVERLAY", geoElements)
  );

  console.debug("RENDER: TopNavbar");

  return (
    <div
      className={
        "h-16 w-full flex items-center gap-6 relative justify-between py-2 px-[12px] " +
        (zenMode && "hidden")
      }
    >
      <ResourceModal />

      <p className="mb-0 font-semibold text-lg">DigiTal Zwilling / Geoportal</p>

      <ActionButtons />
      <div className="flex items-center gap-6">
        <Tooltip title="Hilfefolie überlagern">
          <button
            className="hover:text-gray-600 text-xl lg:mr-11 xl:mr-40"
            onClick={() => setShowTourOverlay(true)}
            data-test-id="helper-overlay-btn"
            ref={helpOverlayTourRef}
          >
            <FontAwesomeIcon
              className="h-[24px] pt-1"
              icon={faCircleQuestion}
            />
          </button>
        </Tooltip>
        <div className="lg:flex hidden" ref={hintergrundTourRef}>
          {backgroundLayer && (
            <Radio.Group
              value={backgroundLayer.id}
              onChange={(e) => {
                e.stopPropagation();
                if (e.target.value === "openBaseLayerView") {
                  dispatch(setSelectedLayerIndex(-1));
                } else if (e.target.value === "karte") {
                  dispatch(
                    setBackgroundLayer({
                      ...selectedMapLayer,
                      id: "karte",
                      visible: true,
                    })
                  );
                  dispatch(setCurrentSceneStyle("secondary"));
                } else {
                  dispatch(
                    setBackgroundLayer({
                      ...selectedLuftbildLayer,
                      id: "luftbild",
                      visible: true,
                    })
                  );
                  dispatch(setCurrentSceneStyle("primary"));
                }
              }}
            >
              <Tooltip
                title={isMode2d ? selectedMapLayer.title : "LoD2-Gebäude (NRW)"}
              >
                <Radio.Button value="karte">Karte</Radio.Button>
              </Tooltip>
              <Tooltip
                title={isMode2d ? selectedLuftbildLayer.title : "3D-Mesh 03/24"}
              >
                <Radio.Button value="luftbild">Luftbild</Radio.Button>
              </Tooltip>
              <Tooltip title="Hintergrund auswählen">
                <Radio.Button value="openBaseLayerView" disabled={!isMode2d}>
                  <FontAwesomeIcon id="openBaseLayerView" icon={faLayerGroup} />
                </Radio.Button>
              </Tooltip>
            </Radio.Group>
          )}
        </div>

        <Tooltip title="Kompaktanleitung öffnen">
          <Button
            onClick={() => {
              setAppMenuVisible(true);
            }}
            ref={modalMenuTourRef}
            data-test-id="modal-menu-btn"
          >
            <FontAwesomeIcon icon={faBars} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default TopNavbar;
