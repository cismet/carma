import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faBars } from "@fortawesome/free-solid-svg-icons";
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
  useSceneStyleToggle,
} from "@carma-mapping/cesium-engine";

import {
  getBackgroundLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
} from "../store/slices/mapping";
import {
  getUIMode,
  getUIOverlayTourMode,
  toggleShowOverlayTour,
  UIMode,
} from "../store/slices/ui";
import ActionButtons from "./nav-items/ActionButtons";

import { layerMap } from "../config";

import ResourceModal from "./nav-items/ResourceModal";
import "./switch.css";

const TopNavbar = () => {
  const dispatch = useDispatch();

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);

  const uiMode = useSelector(getUIMode);
  const tourMode = useSelector(getUIOverlayTourMode);
  const toggleSceneStyle = useSceneStyleToggle();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const handleToggleTour = () => {
    dispatch(toggleShowOverlayTour(!tourMode));
  };
  const menuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENULEISTE", geoElements)
  );
  const hintergrundTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("HINTERGRUND", geoElements)
  );
  const modalMenuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENU", geoElements)
  );

  console.info("RENDER: TopNavbar");

  return (
    <div className="h-16 w-full flex items-center relative justify-between py-2 px-[12px]">
      <ResourceModal />

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <p className="mb-0 font-semibold text-lg">
            DigiTal Zwilling / Geoportal
          </p>
        </div>
      </div>

      <div
        ref={menuTourRef}
        className="flex items-center justify-between w-[57%] absolute left-1/2 -ml-[140px]"
      >
        <ActionButtons />
        <Tooltip
          title={`Hilfe ${uiMode === UIMode.TOUR ? "ausblenden" : "anzeigen"}`}
        >
          <button
            className="hover:text-gray-600 text-xl"
            onClick={handleToggleTour}
          >
            <FontAwesomeIcon icon={faCircleQuestion} />
          </button>
        </Tooltip>
        <div className="flex items-center gap-6">
          <div className="lg:flex hidden" ref={hintergrundTourRef}>
            {backgroundLayer && (
              <Radio.Group
                value={backgroundLayer.id}
                onChange={(e) => {
                  if (e.target.value === "karte") {
                    dispatch(
                      setBackgroundLayer({
                        ...selectedMapLayer,
                        id: "karte",
                        visible: isMode2d,
                      })
                    );
                    toggleSceneStyle("secondary");
                  } else {
                    dispatch(
                      setBackgroundLayer({
                        id: e.target.value,
                        title: layerMap[e.target.value].title,
                        opacity: 1.0,
                        description: layerMap[e.target.value].description,
                        inhalt: layerMap[e.target.value].inhalt,
                        eignung: layerMap[e.target.value].eignung,
                        layerType: "wmts",
                        visible: isMode2d,
                        props: {
                          name: "",
                          url: layerMap[e.target.value].url,
                        },
                        layers: layerMap[e.target.value].layers,
                      })
                    );
                    toggleSceneStyle("primary");
                  }
                }}
              >
                <Radio.Button value="karte">Karte</Radio.Button>
                <Radio.Button value="luftbild">Luftbild</Radio.Button>
              </Radio.Group>
            )}
          </div>

          <Button
            onClick={() => {
              setAppMenuVisible(true);
            }}
            ref={modalMenuTourRef}
          >
            <FontAwesomeIcon icon={faBars} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TopNavbar;
