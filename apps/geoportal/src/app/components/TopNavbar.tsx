import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import {
  faBars,
  faChevronLeft,
  faChevronRight,
  faImages,
  faLayerGroup,
  faPlane,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio, Tooltip } from "antd";
import { useContext, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import { useFeatureFlags } from "@carma-apps/portals";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/lib-helper-overlay";
import { cn } from "@carma-commons/utils";
import { selectViewerIsMode2d } from "@carma-mapping/cesium-engine";

import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
  setSelectedLayerIndex,
} from "../store/slices/mapping";
import { getZenMode } from "../store/slices/ui";

import { MapStyleKeys } from "../constants/MapStyleKeys";
import { useMapStyle } from "../hooks/useGeoportalMapStyle";
import { useOblique } from "../oblique/hooks/useOblique";

import ActionButtons from "./nav-items/ActionButtons";

import ResourceModal from "./nav-items/ResourceModal";
import "./switch.css";

const TopNavbar = () => {
  const dispatch = useDispatch();
  const flags = useFeatureFlags();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const { showOverlayHandler } = useOverlayTourContext();
  const { isObliqueMode, toggleObliqueMode } = useOblique();
  const { setCurrentStyle } = useMapStyle();

  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const isMode2d = useSelector(selectViewerIsMode2d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const zenMode = useSelector(getZenMode);

  const hintergrundTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("HINTERGRUND", geoElements)
  );
  const modalMenuTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MENU", geoElements)
  );
  const helpOverlayTourRef = useOverlayHelper({
    ...getCollabedHelpElementsConfig("HILFE_OVERLAY", geoElements),
    primary: {
      ...getCollabedHelpElementsConfig("HILFE_OVERLAY", geoElements).primary,
      minWindowSize: 1024,
    },
  });

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  console.debug("RENDER: TopNavbar");

  return (
    <div
      className={
        "bg-white h-16 fixed top-0 left-0 right-0 \
        items-center justify-between gap-2 xs:gap-3 sm:gap-6 \
        py-2 pt-safe-top pb-safe-bottom \
        pl-safe-left xs:pl-safe-left-xs pr-safe-right xs:pr-safe-right-xs"
      }
      style={{
        visibility: zenMode ? "hidden" : undefined,
        display: zenMode ? "none" : "flex",
        zIndex: 10000,
      }}
    >
      <ResourceModal />

      <p
        className={`mb-0 font-semibold text-lg min-w-max ${
          mobileMenuOpen ? "sm:block hidden" : ""
        }`}
      >
        DigiTal Zwilling / Geoportal
      </p>

      <button
        onClick={toggleMobileMenu}
        className="sm:hidden flex items-center justify-center p-2"
      >
        <FontAwesomeIcon
          icon={mobileMenuOpen ? faChevronRight : faChevronLeft}
        />
      </button>

      <div
        className={cn("transition-all duration-300 ease-in-out", {
          "hidden sm:block": !mobileMenuOpen,
        })}
      >
        <ActionButtons />
      </div>

      <div
        className={cn("transition-all duration-300 ease-in-out", {
          "hidden sm:block": !mobileMenuOpen,
        })}
      >
        <div className={cn("flex items-center gap-3 sm:gap-6")}>
          <Tooltip
            open={!isTouchDevice && showHelpTooltip}
            title="Hilfefolie überlagern"
          >
            <button
              className="hover:text-gray-600 text-xl lg:mr-11 hidden sm:block xl:mr-40"
              onClick={showOverlayHandler}
              data-test-id="helper-overlay-btn"
              ref={helpOverlayTourRef}
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
            >
              <FontAwesomeIcon
                className="h-[24px] pt-1"
                icon={faCircleQuestion}
              />
            </button>
          </Tooltip>
          {flags.featureFlagObliqueMode && !isMode2d && (
            <Tooltip
              title={
                isObliqueMode
                  ? "Schrägansicht deaktivieren"
                  : "Schrägansicht aktivieren"
              }
            >
              <Button
                type={isObliqueMode ? "primary" : "default"}
                onClick={toggleObliqueMode}
                className="mr-2"
              >
                <FontAwesomeIcon icon={faPlane} rotation={270} />
                <FontAwesomeIcon icon={faImages} />
              </Button>
            </Tooltip>
          )}
          <div className="lg:flex hidden" ref={hintergrundTourRef}>
            {backgroundLayer && (
              <Radio.Group
                value={backgroundLayer.id}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value === "openBaseLayerView") {
                    dispatch(setSelectedLayerIndex(-1));
                  } else if (e.target.value === MapStyleKeys.TOPO) {
                    setCurrentStyle(MapStyleKeys.TOPO);
                  } else if (e.target.value === MapStyleKeys.AERIAL) {
                    setCurrentStyle(MapStyleKeys.AERIAL);
                  }
                }}
              >
                <Tooltip
                  title={
                    isMode2d ? selectedMapLayer.title : "LoD2-Gebäude (NRW)"
                  }
                >
                  <Radio.Button value={MapStyleKeys.TOPO}>Karte</Radio.Button>
                </Tooltip>
                <Tooltip
                  title={
                    isMode2d ? selectedLuftbildLayer.title : "3D-Mesh 03/24"
                  }
                >
                  <Radio.Button value={MapStyleKeys.AERIAL}>
                    Luftbild
                  </Radio.Button>
                </Tooltip>
                <Tooltip title="Hintergrund auswählen">
                  <Radio.Button value="openBaseLayerView" disabled={!isMode2d}>
                    <FontAwesomeIcon
                      id="openBaseLayerView"
                      icon={faLayerGroup}
                    />
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
    </div>
  );
};

export default TopNavbar;
