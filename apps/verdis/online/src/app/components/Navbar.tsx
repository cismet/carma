import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCloudUploadAlt,
  faCloudDownloadAlt,
  faCloudRain,
  faFilePdf,
  faInfoCircle,
  faChartPie,
  faUser,
  faPowerOff,
} from "@fortawesome/free-solid-svg-icons";
import {
  Navbar,
  Nav,
  NavItem,
  OverlayTrigger,
  Tooltip,
  Popover,
  Overlay,
  Container,
} from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import {
  getKassenzeichen,
  getNumberOfPendingChanges,
} from "../../store/slices/kassenzeichen";
import {
  CLOUDSTORAGESTATES,
  getUiState,
  setNavbarHight,
  setWaitForFEB,
  showChangeRequestsMenu,
  showInfo,
  showSettings,
  showWaiting,
  toggleChartElements,
  toggleContactElement,
  toggleInfoElements,
} from "../../store/slices/ui";
import { colorDraft } from "../../utils/kassenzeichenHelper";
import Waiting from "./Waiting";
import { useEffect, useRef } from "react";
import "./navbar.css";
import { getStac, logout } from "../../store/slices/auth";
import { tooltips } from "@carma-collab/wuppertal/verdis-online";
import type { OverlayTriggerType } from "react-bootstrap/esm/OverlayTrigger";
import type { UnknownAction } from "redux";
import { useNavigate } from "react-router-dom";
import { fitAll } from "../../store/slices/mapping";
import { Badge } from "antd";

const VerdisOnlineAppNavbar = () => {
  const dispatch = useDispatch();
  const navRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef(null);
  const kassenzeichen = useSelector(getKassenzeichen);
  const uiState = useSelector(getUiState);
  const stac = useSelector(getStac);
  const navigate = useNavigate();

  const crCounter = getNumberOfPendingChanges(kassenzeichen.aenderungsanfrage);
  let kasszLabel = "Kassenzeichen: ";
  let lblDownLoadFeb = "Flächenerfassungsbogen herunterladen (PDF)";
  let lblInfo = uiState.infoElementsEnabled
    ? tooltips.flachenInfoTooltip.ausblenden
    : tooltips.flachenInfoTooltip.einblenden;
  let lblChart = uiState.chartElementsEnabled
    ? tooltips.diagrammTooltip.ausblenden
    : tooltips.diagrammTooltip.einblenden;
  let lblContact = uiState.contactElementEnabled
    ? tooltips.ansprechpartner.ausblenden
    : tooltips.ansprechpartner.einblenden;
  let lblExit = "VerDIS-online beenden";
  let menuIsHidden = false;

  if (uiState.width < 768) {
    menuIsHidden = true;
  }

  let ttTriggerOn: OverlayTriggerType[] = ["hover", "focus"];
  let ttTriggerOff: OverlayTriggerType[] = [];
  let kassenzeichennummer;
  if (kassenzeichen.kassenzeichennummer8) {
    kassenzeichennummer =
      " (" + kasszLabel + kassenzeichen.kassenzeichennummer8 + ")";
  } else {
    kassenzeichennummer = "";
  }

  let pdfIconStyle;
  if (uiState.febBlob !== null) {
    pdfIconStyle = { color: "white" };
  } else {
    pdfIconStyle = { color: "grey" };
  }

  const handleDownloadFEB = () => {
    if (uiState.febBlob !== null) {
      let link = document.createElement("a");
      link.href = window.URL.createObjectURL(uiState.febBlob);
      link.download =
        "FEB." + kassenzeichen.kassenzeichennummer + ".STAC." + stac + ".pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      dispatch(setWaitForFEB(true));
    }
  };

  const fixLeftPadding = menuIsHidden ? "10px 15px 15px 10px" : "20px 15px";

  const target = useRef(null);

  useEffect(() => {
    if (!navRef.current) return;
    const measure = () => {
      const h = navRef.current!.getBoundingClientRect().height;
      dispatch(setNavbarHight(h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(navRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (uiState.waitForFEB === true) {
      //dh downloadFeb() wurde aufgerufen aber der Download ist noch nicht fertig
      if (uiState.febBlob === null && uiState.waitingVisible === false) {
        dispatch(showInfo("FEB wird erzeugt"));
        dispatch(showWaiting(true));
      } else if (uiState.febBlob !== null && uiState.waitingVisible === true) {
        handleDownloadFEB();
        dispatch(showWaiting(false));
        dispatch(setWaitForFEB(false));
      }
    }
  }, [uiState.waitForFEB, uiState.febBlob, uiState.waitingVisible]);

  return (
    <div ref={navRef}>
      <Navbar
        style={{
          marginBottom: 0,
          backgroundImage: "linear-gradient(to bottom, #3c3c3c 0, #222 100%)",
          backgroundRepeat: "repeat-x",
          borderRadius: 4,
          backgroundColor: "#222",
          borderColor: "#080808",
          padding: menuIsHidden ? "10px" : 0,
        }}
        expand="md"
        variant="dark"
      >
        <Container className="d-flex flex-wrap" fluid="md">
          <OverlayTrigger
            trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
            placement="bottom"
            overlay={
              <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                alle Teilflächen zum Kassenzeichen anzeigen
              </Tooltip>
            }
          >
            <span style={{ padding: "10px" }}>
              <Navbar.Brand
                style={{
                  color: "#9d9d9d",
                  textShadow: "0 -1px 0 rgba(0, 0, 0, .25)",
                  paddingLeft: menuIsHidden ? "10px" : "0px",
                }}
              >
                <a
                  id="verdis_online_brand"
                  style={{ cursor: "pointer" }}
                  onClick={() => dispatch(fitAll() as unknown as UnknownAction)}
                >
                  VerDIS-online{kassenzeichennummer}
                </a>
              </Navbar.Brand>

              <Navbar.Toggle
                aria-controls="basic-navbar-nav"
                style={{ borderColor: "transparent" }}
              />
            </span>
          </OverlayTrigger>
          <Navbar.Collapse id="basic-navbar-nav">
            <ul
              className="nav navbar-right navbar-nav ml-auto"
              style={{ listStyle: "none" }}
            >
              <li role="presentation" ref={target}>
                <a
                  // href="#"
                  role="button"
                  onClick={() => dispatch(showSettings({ visible: true }))}
                  style={{
                    color: "#9d9d9d",
                    backgroundColor: "transparent",
                    position: "relative",
                    display: "block",
                    padding: fixLeftPadding,
                    lineHeight: "20px",
                    // paddingTop: "15px",
                    // paddingBottom: "15px",
                  }}
                >
                  Hilfe & Einstellungen
                </a>
                <Overlay
                  target={target.current}
                  show={!uiState.waitingVisible && uiState.hintVisible}
                  placement="bottom"
                >
                  <Popover id="popover-basic">
                    <div style={{ padding: "10px" }}>
                      Benötigen Sie Unterstützung oder möchten nähere
                      Information, finden Sie diese hier unter "Hilfe &
                      Einstellungen"
                    </div>
                  </Popover>
                </Overlay>
              </li>
              <li role="presentation">
                <a
                  // href="#"
                  onClick={() =>
                    dispatch(showChangeRequestsMenu({ visible: true }))
                  }
                  role="button"
                  style={{
                    color: "#9d9d9d",
                    backgroundColor: "transparent",
                    position: "relative",
                    display: "block",
                    padding: fixLeftPadding,
                    lineHeight: "20px",
                    // paddingTop: "15px",
                    // paddingBottom: "15px",
                  }}
                >
                  Änderungswünsche{" "}
                  {uiState.changeRequestsEditMode === true &&
                    crCounter.crDraftCounter > 0 && (
                      <Badge
                        count={crCounter.crDraftCounter}
                        color={colorDraft}
                        style={{
                          backgroundColor: colorDraft,
                          boxShadow: "none",
                        }}
                      />
                    )}
                  {crCounter.crDraftCounter === 0 &&
                    crCounter.crCounter > 0 && (
                      <Badge
                        color="#777777"
                        count={crCounter.crCounter}
                        style={{
                          backgroundColor: "#777777",
                          boxShadow: "none",
                        }}
                      />
                    )}
                </a>
              </li>
              <OverlayTrigger
                trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
                placement="bottom"
                overlay={
                  <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                    {lblDownLoadFeb}
                  </Tooltip>
                }
              >
                <li role="presentation">
                  <a
                    // href="#"
                    role="button"
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                      // paddingTop: "15px",
                      // paddingBottom: "15px",
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faFilePdf}
                      style={pdfIconStyle}
                      onClick={handleDownloadFEB}
                    />
                    {menuIsHidden ? "   " + lblDownLoadFeb : ""}
                  </a>
                </li>
              </OverlayTrigger>
              <OverlayTrigger
                trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
                placement="bottom"
                overlay={
                  <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                    {lblInfo}
                  </Tooltip>
                }
              >
                <li
                  role="presentation"
                  className={uiState.infoElementsEnabled ? "active" : ""}
                >
                  <a
                    // href="#"
                    role="button"
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                      // paddingTop: "15px",
                      // paddingBottom: "15px",
                    }}
                    onClick={() => dispatch(toggleInfoElements({}))}
                  >
                    <FontAwesomeIcon icon={faInfoCircle} />
                    {menuIsHidden ? "   " + lblInfo : ""}
                  </a>
                </li>
              </OverlayTrigger>
              <OverlayTrigger
                trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
                placement="bottom"
                overlay={
                  <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                    {lblChart}
                  </Tooltip>
                }
              >
                <li
                  role="presentation"
                  className={uiState.chartElementsEnabled ? "active" : ""}
                >
                  <a
                    // href="#"
                    role="button"
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                      // paddingTop: "15px",
                      // paddingBottom: "15px",
                    }}
                    onClick={() => dispatch(toggleChartElements({}))}
                  >
                    <FontAwesomeIcon icon={faChartPie} />
                    {menuIsHidden ? "   " + lblChart : ""}
                  </a>
                </li>
              </OverlayTrigger>
              <OverlayTrigger
                trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
                placement="bottom"
                overlay={
                  <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                    {lblContact}
                  </Tooltip>
                }
              >
                <li
                  role="presentation"
                  className={uiState.contactElementEnabled ? "active" : ""}
                >
                  <a
                    // href="#"
                    role="button"
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      paddingLeft: "10px",
                      padding: fixLeftPadding,
                      // lineHeight: "20px",
                      // paddingTop: "15px",
                      // paddingBottom: "15px",
                    }}
                    onClick={() => dispatch(toggleContactElement({}))}
                  >
                    <FontAwesomeIcon icon={faUser} />
                    {menuIsHidden ? "   " + lblContact : ""}
                  </a>
                </li>
              </OverlayTrigger>
              <OverlayTrigger
                trigger={menuIsHidden ? ttTriggerOff : ttTriggerOn}
                placement="bottom"
                overlay={
                  <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                    {lblExit}
                  </Tooltip>
                }
              >
                <li role="presentation">
                  <a
                    // href="#"
                    role="button"
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                      // paddingTop: "15px",
                      // paddingBottom: "15px",
                    }}
                    onClick={() => {
                      navigate("/");
                      dispatch(logout() as unknown as UnknownAction);
                    }}
                  >
                    <FontAwesomeIcon icon={faPowerOff} />
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                </li>
              </OverlayTrigger>
              <li role="presentation">
                {uiState.cloudStorageStatus ===
                  CLOUDSTORAGESTATES.CLOUD_STORAGE_UP && (
                  <a
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                    }}
                  >
                    <FontAwesomeIcon icon={faCloudUploadAlt} />
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                )}
                {uiState.cloudStorageStatus ===
                  CLOUDSTORAGESTATES.CLOUD_STORAGE_DOWN && (
                  <a
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                    }}
                  >
                    <FontAwesomeIcon icon={faCloudDownloadAlt} />
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                )}
                {uiState.cloudStorageStatus ===
                  CLOUDSTORAGESTATES.CLOUD_STORAGE_ERROR && (
                  <a
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                    }}
                  >
                    <FontAwesomeIcon icon={faCloudRain} />
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                )}
                {uiState.cloudStorageStatus === undefined && (
                  <a
                    style={{
                      color: "#9d9d9d",
                      backgroundColor: "transparent",
                      position: "relative",
                      display: "block",
                      padding: fixLeftPadding,
                      lineHeight: "20px",
                      width: 50,
                    }}
                  >
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                )}
              </li>
            </ul>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Waiting
        key={
          "Waiting.visible." +
          uiState.waitingVisible +
          " ...message." +
          uiState.waitingMessage +
          " ...type." +
          uiState.waitingType
        }
      />
    </div>
  );
};

export default VerdisOnlineAppNavbar;
