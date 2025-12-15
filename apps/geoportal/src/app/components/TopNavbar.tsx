import {
  type CSSProperties,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
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
import { Button, Radio, type RadioChangeEvent, Tooltip } from "antd";

import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/helper-overlay";
import { cn } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useFeatureFlags } from "@carma-providers/feature-flag";

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

  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const zenMode = useSelector(getZenMode);

  const hintergrundConfig = useMemo(
    () => getCollabedHelpElementsConfig("HINTERGRUND", geoElements),
    []
  );
  const modalMenuConfig = useMemo(
    () => getCollabedHelpElementsConfig("MENU", geoElements),
    []
  );

  const hintergrundTourRef = useOverlayHelper(hintergrundConfig);
  const modalMenuTourRef = useOverlayHelper(modalMenuConfig);

  const overlayConfig = useMemo(() => {
    return {
      ...getCollabedHelpElementsConfig("HILFE_OVERLAY", geoElements),
      primary: {
        ...getCollabedHelpElementsConfig("HILFE_OVERLAY", geoElements).primary,
        minWindowSize: 1024,
      },
    };
  }, []);

  const helpOverlayTourRef = useOverlayHelper(overlayConfig);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(!mobileMenuOpen);
  }, [mobileMenuOpen]);

  const handleShowHelpTooltip = useCallback(() => {
    setShowHelpTooltip(true);
  }, []);

  const handleHideHelpTooltip = useCallback(() => {
    setShowHelpTooltip(false);
  }, []);

  const handleBackgroundLayerChange = useCallback(
    (e: RadioChangeEvent) => {
      e.stopPropagation();
      if (e.target.value === "openBaseLayerView") {
        dispatch(setSelectedLayerIndex(-1));
      } else if (e.target.value === MapStyleKeys.TOPO) {
        setCurrentStyle(MapStyleKeys.TOPO);
      } else if (e.target.value === MapStyleKeys.AERIAL) {
        setCurrentStyle(MapStyleKeys.AERIAL);
      }
    },
    [dispatch, setCurrentStyle]
  );

  const handleAppMenuVisible = useCallback(() => {
    setAppMenuVisible(true);
  }, []); // setAppMenuVisible from context is stable

  const mainStyle = useMemo((): CSSProperties => {
    return {
      visibility: zenMode ? "hidden" : undefined,
      display: zenMode ? "none" : "flex",
      zIndex: 10000,
    };
  }, [zenMode]);

  console.debug("RENDER: TopNavbar");

  return (
    <div
      className={
        "bg-white h-16 fixed top-0 left-0 right-0 \
        items-center justify-between gap-2 xs:gap-3 sm:gap-6 \
        py-2 pt-safe-top pb-safe-bottom \
        pl-safe-left xs:pl-safe-left-xs pr-safe-right xs:pr-safe-right-xs"
      }
      style={mainStyle}
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
        className="sm:hidden flex items-center justify-center p-2 select-none"
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
              className="hover:text-gray-600 text-xl lg:mr-11 hidden sm:block xl:mr-40 select-none"
              onClick={showOverlayHandler}
              data-test-id="helper-overlay-btn"
              ref={helpOverlayTourRef}
              onMouseEnter={handleShowHelpTooltip}
              onMouseLeave={handleHideHelpTooltip}
            >
              <FontAwesomeIcon
                className="h-[24px] pt-1"
                icon={faCircleQuestion}
              />
            </button>
          </Tooltip>
          {flags.featureFlagObliqueMode && isCesium && (
            <Tooltip
              title={
                isObliqueMode
                  ? "Modus Schrägluftbilder ausschalten"
                  : "Modus Schrägluftbilder einschalten"
              }
            >
              <Button
                type={isObliqueMode ? "primary" : "default"}
                onClick={toggleObliqueMode}
                className="mr-2 select-none"
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
                onChange={handleBackgroundLayerChange}
              >
                <Tooltip
                  title={
                    isLeaflet ? selectedMapLayer.title : "LoD2-Gebäude (NRW)"
                  }
                >
                  <Radio.Button
                    className="select-none"
                    value={MapStyleKeys.TOPO}
                  >
                    Karte
                  </Radio.Button>
                </Tooltip>
                <Tooltip
                  title={
                    isLeaflet ? selectedLuftbildLayer.title : "3D-Mesh 03/24"
                  }
                >
                  <Radio.Button
                    className="select-none"
                    value={MapStyleKeys.AERIAL}
                  >
                    Luftbild
                  </Radio.Button>
                </Tooltip>
                <Tooltip title="Hintergrund auswählen">
                  <Radio.Button
                    className="select-none"
                    value="openBaseLayerView"
                    disabled={!isLeaflet}
                  >
                    <FontAwesomeIcon
                      id="openBaseLayerView"
                      icon={faLayerGroup}
                    />
                  </Radio.Button>
                </Tooltip>
              </Radio.Group>
            )}
          </div>

          <Tooltip title="Kompaktanleitung | Login">
            <Button
              onClick={handleAppMenuVisible}
              ref={modalMenuTourRef}
              data-test-id="modal-menu-btn"
              className="select-none"
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
