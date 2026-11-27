import { Alert, AlertContainer } from "react-bs-notifier";
import { Form, FormGroup, Row, Col, Button, Container } from "react-bootstrap";
import Loadable from "react-loading-overlay-ts";
import MaskedFormControl from "react-bootstrap-maskedinput";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getKassenzeichenbySTAC } from "../../store/slices/kassenzeichen";
import {
  getLoginInProgress,
  getLoginInfoText,
  getStac,
  logout,
} from "../../store/slices/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { getConfData, getUiState } from "../../store/slices/ui";
import {
  Kontaktinformationen,
  VersionNumberLoginPage,
} from "@carma-collab/wuppertal/verdis-online";
import type { UnknownAction } from "redux";
import { getApplicationVersion } from "@carma-commons/utils";
import "./VerdisOnlineLanding.css";
import StatusNotification from "./StatusNotification";
import versionData from "../../version.json";
import queryString from "query-string";
import { getVersion } from "../../constants/versions";
import { DOMAIN, STAC_SERVICE } from "../../constants/cids";

const VerdisOnlineLanding = () => {
  const [stac, setStac] = useState("");
  const [loginAlertVisible, setLoginAlertVisible] = useState(false);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const { width, height } = useSelector(getUiState);
  // same breakpoints as the phone rules in VerdisOnlineLanding.css
  const isPhone = width < 576 || (width > height && height <= 500);
  const dispatch = useDispatch();
  const authStac = useSelector(getStac);
  const loginInProgress = useSelector(getLoginInProgress);
  const loginInfoText = useSelector(getLoginInfoText);
  const confData = useSelector(getConfData);
  const navigate = useNavigate();
  const location = useLocation();
  const baseUrl = window.location.origin + window.location.pathname;

  const handleStacInput = (e) => {
    setStac(e.target.value);
    handleStacChange(e.target.value);
  };

  const handleStacChange = (rawStac) => {
    setStac(rawStac);
    if (rawStac) {
      let stac = rawStac.trim().replace(/[- ]/g, "");
      if (stac.length === 12) {
        dispatch(
          getKassenzeichenbySTAC(stac, (success) => {
            if (success === true) {
              setTimeout(() => {
                const verificationCode = queryString.parse(
                  location.search
                ).emailVerificationCode;
                let verificationCodeSuffix = "";
                if (verificationCode) {
                  verificationCodeSuffix =
                    "?emailVerificationCode=" + verificationCode;
                }

                navigate("/meinkassenzeichen" + verificationCodeSuffix);
              }, 100);
            } else {
              setTimeout(() => {
                setStac("");
                navigate("/");
                setLoginAlertVisible(true);
              }, 1000);
            }
          }) as unknown as UnknownAction
        );
      }
    }
  };

  const checkNetworkConnection = () => {
    const url =
      STAC_SERVICE + "/actions/" + DOMAIN + ".checkCidsServerMessage?role=all";
    fetch(url, {
      method: "get",
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          setConnectionProblem(false);
        } else {
          setConnectionProblem(true);
        }
      })
      .catch(function () {
        setConnectionProblem(true);
      });
  };

  useEffect(() => {
    const interval = setInterval(() => checkNetworkConnection(), 2000);

    const verificationCode = queryString.parse(
      location.search
    ).emailVerificationCode;

    let stac = "";

    if (verificationCode && authStac) {
      //Check whether the user is already logged in
      stac = authStac;
    } else {
      dispatch(logout() as unknown as UnknownAction);
    }

    setStac(stac);
    handleStacChange(stac);

    return () => {
      return clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isPhone || !loginAlertVisible) {
      return;
    }
    const timeout = setTimeout(() => setLoginAlertVisible(false), 10000);
    return () => clearTimeout(timeout);
  }, [isPhone, loginAlertVisible]);

  // iOS pushes the page up for the keyboard and does not always scroll back once it closes,
  // which cuts off the header and shows the empty body below the page
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    const scrollBackWhenKeyboardClosed = () => {
      if (vv.scale > 1.01) {
        return;
      }
      const keyboardOpen =
        document.documentElement.clientHeight - vv.height > 100;
      if (!keyboardOpen && (window.scrollY !== 0 || vv.offsetTop !== 0)) {
        window.scrollTo(0, 0);
      }
    };
    vv.addEventListener("resize", scrollBackWhenKeyboardClosed);
    return () => {
      vv.removeEventListener("resize", scrollBackWhenKeyboardClosed);
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ width: "100%", height: "100%", position: "absolute" }}>
        {!isPhone && (
          <AlertContainer position="top-right">
            <div>
              {connectionProblem && (
                <Alert
                  type="danger"
                  headline="Verbindungsprobleme."
                  onDismiss={() => {
                    setConnectionProblem(false);
                  }}
                >
                  Im Moment können wir keine Verbindung zu unseren Diensten
                  aufbauen.
                </Alert>
              )}
              {loginAlertVisible && (
                <Alert
                  type="danger"
                  timeout={10000}
                  headline="Anmeldeinformationen fehlerhaft oder abgelaufen."
                  onDismiss={() => {
                    setLoginAlertVisible(false);
                  }}
                >
                  Bitte überprüfen Sie den eingegeben Code und dessen
                  Gültigkeitsdauer. Bei Problemen mit der Anmeldung, wenden Sie
                  sich bitte an den untenstehende Kontakt.
                </Alert>
              )}
              {confData &&
                confData.messages &&
                confData.messages.map((message) => {
                  return (
                    <div key={message.key}>
                      {
                        <Alert
                          key={"alert" + message.key}
                          type={message.type}
                          timeout={message.timeout}
                          headline={message.headline}
                        >
                          {message.content}
                        </Alert>
                      }
                    </div>
                  );
                })}
            </div>
          </AlertContainer>
        )}
      </div>

      <div
        className="verdis-landing"
        style={{ backgroundImage: `url(${baseUrl}images/background.jpg)` }}
      >
        <div className="verdis-landing-content">
          <div className="verdis-landing-header">
            <Container>
              <img
                alt=""
                className="verdis-landing-logo"
                src={baseUrl + "/images/wuppertal-white.svg"}
              />
              {getVersion() === "dev-hot-reload" &&
                process.env.NODE_ENV === "development" && (
                  <Button
                    style={{ margin: 5 }}
                    variant="light"
                    onClick={() => {
                      handleStacChange("STACSTACSTAC");
                    }}
                  >
                    Rathaus
                  </Button>
                )}
              <h2>VerDIS - online</h2>
              <h3>Versiegelungsdaten | Flächenentwässerung</h3>
            </Container>
          </div>

          <div className="verdis-landing-bottom">
            <Container>
              <Row>
                <Col xs={12} md={6} className="verdis-landing-login-col">
                  {isPhone && (
                    <div className="verdis-landing-notifications">
                      {connectionProblem && (
                        <StatusNotification
                          variant="danger"
                          compact
                          defaultExpanded
                          title="Verbindungsprobleme"
                          onClose={() => setConnectionProblem(false)}
                        />
                      )}
                      {loginAlertVisible && (
                        <StatusNotification
                          variant="danger"
                          compact
                          defaultExpanded
                          title="Code fehlerhaft oder abgelaufen"
                          onClose={() => setLoginAlertVisible(false)}
                        />
                      )}
                      {confData?.messages?.map((message) => (
                        <StatusNotification
                          key={"pill" + message.key}
                          variant={
                            message.type === "danger" ||
                            message.type === "warning" ||
                            message.type === "success"
                              ? message.type
                              : "info"
                          }
                          compact
                          defaultExpanded
                          title={message.headline}
                        >
                          {message.content}
                        </StatusNotification>
                      ))}
                    </div>
                  )}
                  <div className="verdis-landing-login-box">
                    <Loadable
                      active={loginInProgress}
                      spinner
                      text={loginInfoText}
                    >
                      <div className="verdis-landing-panel">
                        <div className="verdis-landing-panel-inner">
                          <h3>Zugangscode:</h3>
                          <Form
                            className="LoginForm"
                            id="loginForm"
                            onSubmit={(e) => {
                              e.preventDefault();
                            }}
                          >
                            <FormGroup controlId="stacInput">
                              <MaskedFormControl
                                autoFocus
                                key={"MaskedFormControl.with"}
                                style={{
                                  height: "50px",
                                  border: "1px solid #9999992",
                                  padding: "5px",
                                  fontSize: "24px",
                                  fontFamily: "monospace",
                                }}
                                placeholderChar=" "
                                type="text"
                                name="stac"
                                mask="AAAA-AAAA-AAAA"
                                value={stac}
                                onChange={handleStacInput}
                                disabled={connectionProblem}
                              />
                            </FormGroup>
                          </Form>
                        </div>
                      </div>
                    </Loadable>
                  </div>
                </Col>
                <Col
                  xs={12}
                  md={{ span: 5, offset: 1 }}
                  className="verdis-landing-contact-col"
                >
                  <div className="verdis-landing-contact">
                    <Kontaktinformationen fontSize="inherit" />
                  </div>
                </Col>
              </Row>
            </Container>
            <div className="verdis-landing-versions">
              <div style={{ color: "rgba(255,255,255,0.5)" }}>
                {getVersion()}
              </div>
              <VersionNumberLoginPage
                version={getApplicationVersion(versionData)}
                fonntSize="9px"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerdisOnlineLanding;
