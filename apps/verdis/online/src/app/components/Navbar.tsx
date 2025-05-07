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
  Badge,
  Popover,
  Overlay,
  Container,
} from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import {
  getFEBByStac,
  getKassenzeichen,
  getNumberOfPendingChanges,
} from "../../store/slices/kassenzeichen";
import {
  CLOUDSTORAGESTATES,
  getUiState,
  setWaitForFEB,
  showChangeRequests,
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

const VerdisOnlineAppNavbar = () => {
  const dispatch = useDispatch();
  const helpRef = useRef(null);
  const kassenzeichen = useSelector(getKassenzeichen);
  const uiState = useSelector(getUiState);
  const stac = useSelector(getStac);

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
    console.log("xxx handleDownloadFEB uiState.febBlob", uiState.febBlob);
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

  useEffect(() => {
    console.log("xxx uiState.waitForFEB", uiState.waitForFEB);
    if (uiState.waitForFEB === true) {
      //dh downloadFeb() wurde aufgerufen aber der Download ist noch nicht fertig
      if (uiState.febBlob === null && uiState.waitingVisible === false) {
        console.log("xxx 1");
        dispatch(showInfo("FEB wird erzeugt"));
        dispatch(showWaiting(true));
      } else if (uiState.febBlob !== null && uiState.waitingVisible === true) {
        console.log("xxx 2");
        handleDownloadFEB();
        dispatch(showWaiting(false));
        dispatch(setWaitForFEB(false));
      }
    }
  }, [uiState.waitForFEB, uiState.febBlob, uiState.waitingVisible]);

  return (
    <div>
      <Navbar
        style={{
          marginBottom: 0,
          backgroundImage: "linear-gradient(to bottom, #3c3c3c 0, #222 100%)",
          backgroundRepeat: "repeat-x",
          borderRadius: 4,
          backgroundColor: "#222",
          borderColor: "#080808",
          padding: 0,
        }}
      >
        <Container>
          <OverlayTrigger
            placement="bottom"
            overlay={
              <Tooltip style={{ zIndex: 3000000000 }} id="prevtt">
                alle Teilflächen zum Kassenzeichen anzeigen
              </Tooltip>
            }
          >
            <>
              <Navbar.Brand
                style={{
                  color: "#9d9d9d",
                  textShadow: "0 -1px 0 rgba(0, 0, 0, .25)",
                }}
              >
                <a
                  id="verdis_online_brand"
                  style={{ cursor: "pointer" }}
                  // onClick={this.fitBounds}
                >
                  VerDIS-online{kassenzeichennummer}
                </a>
              </Navbar.Brand>

              <Navbar.Toggle />
            </>
          </OverlayTrigger>
          <Navbar.Collapse>
            <ul
              className="nav navbar-right navbar-nav ml-auto"
              style={{ listStyle: "none" }}
            >
              <li role="presentation">
                <a
                  // href="#"
                  role="button"
                  onClick={() => dispatch(showSettings({ visible: true }))}
                  style={{
                    color: "#9d9d9d",
                    backgroundColor: "transparent",
                    position: "relative",
                    display: "block",
                    padding: "10px 15px",
                    lineHeight: "20px",
                    paddingTop: "15px",
                    paddingBottom: "15px",
                  }}
                >
                  Hilfe & Einstellungen
                </a>
              </li>
              <li role="presentation">
                <a
                  // href="#"
                  onClick={() =>
                    dispatch(showChangeRequests({ visible: true }))
                  }
                  role="button"
                  style={{
                    color: "#9d9d9d",
                    backgroundColor: "transparent",
                    position: "relative",
                    display: "block",
                    padding: "10px 15px",
                    lineHeight: "20px",
                    paddingTop: "15px",
                    paddingBottom: "15px",
                  }}
                >
                  Änderungswünsche{" "}
                  {uiState.changeRequestsEditMode === true &&
                    crCounter.crDraftCounter > 0 && (
                      <Badge
                        style={{ backgroundColor: colorDraft, color: "white" }}
                      >
                        {crCounter.crDraftCounter}
                      </Badge>
                    )}
                  {crCounter.crDraftCounter === 0 &&
                    crCounter.crCounter > 0 && (
                      <Badge>{crCounter.crCounter}</Badge>
                    )}
                </a>
              </li>
              <li role="presentation">
                <a
                  // href="#"
                  role="button"
                  style={{
                    color: "#9d9d9d",
                    backgroundColor: "transparent",
                    position: "relative",
                    display: "block",
                    padding: "10px 15px",
                    lineHeight: "20px",
                    paddingTop: "15px",
                    paddingBottom: "15px",
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
                      padding: "10px 15px",
                      lineHeight: "20px",
                      paddingTop: "15px",
                      paddingBottom: "15px",
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
                      padding: "10px 15px",
                      lineHeight: "20px",
                      paddingTop: "15px",
                      paddingBottom: "15px",
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
                      padding: "10px 15px",
                      lineHeight: "20px",
                      paddingTop: "15px",
                      paddingBottom: "15px",
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
                      padding: "10px 15px",
                      lineHeight: "20px",
                      paddingTop: "15px",
                      paddingBottom: "15px",
                    }}
                    onClick={() =>
                      dispatch(logout() as unknown as UnknownAction)
                    }
                  >
                    <FontAwesomeIcon icon={faPowerOff} />
                    {menuIsHidden ? "   " + lblExit : ""}
                  </a>
                </li>
              </OverlayTrigger>
            </ul>
            {/* <Nav className="ml-auto">
              {uiState.cloudStorageStatus ===
                CLOUDSTORAGESTATES.CLOUD_STORAGE_UP && (
                <NavItem
                  id="navitem_cloud"
                  //   eventKey={4}
                >
                  <FontAwesomeIcon icon={faCloudUploadAlt} />
                  {menuIsHidden ? '   ' + lblExit : ''}
                </NavItem>
              )}
              {uiState.cloudStorageStatus ===
                CLOUDSTORAGESTATES.CLOUD_STORAGE_DOWN && (
                <NavItem
                  id="navitem_cloud"
                  //   eventKey={4}
                >
                  <FontAwesomeIcon icon={faCloudDownloadAlt} />
                  {menuIsHidden ? '   ' + lblExit : ''}
                </NavItem>
              )}
              {uiState.cloudStorageStatus ===
                CLOUDSTORAGESTATES.CLOUD_STORAGE_ERROR && (
                <NavItem
                  id="navitem_cloud"
                  //    eventKey={4}
                >
                  <FontAwesomeIcon icon={faCloudRain} />
                  {menuIsHidden ? '   ' + lblExit : ''}
                </NavItem>
              )}
              {uiState.cloudStorageStatus === undefined && (
                <NavItem
                  style={{ width: 50 }}
                  id="navitem_cloud"
                  // eventKey={4}
                  // href="/#/"
                >
                  {menuIsHidden ? '   ' + lblExit : ''}
                </NavItem>
              )}
            </Nav> */}
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
