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
import { getConfData } from "../../store/slices/ui";
import {
  Kontaktinformationen,
  VersionNumberLoginPage,
} from "@carma-collab/wuppertal/verdis-online";
import type { UnknownAction } from "redux";
import { getApplicationVersion } from "@carma-commons/utils";
import "./VerdisOnlineLanding.css";
import versionData from "../../version.json";
import queryString from "query-string";
import { getVersion } from "../../constants/versions";
import { DOMAIN, STAC_SERVICE } from "../../constants/cids";

const VerdisOnlineLanding = () => {
  const [stac, setStac] = useState("");
  const [loginAlertVisible, setLoginAlertVisible] = useState(false);
  const [connectionProblem, setConnectionProblem] = useState(false);
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

  return (
    <div style={{ position: "relative" }}>
      <div style={{ width: "100%", height: "100%", position: "absolute" }}>
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
                  <span>
                    <Button
                      style={{ margin: 5 }}
                      variant="light"
                      onClick={() => {
                        handleStacChange("STACSTACSTAC");
                      }}
                    >
                      Rathaus
                    </Button>
                    <Button
                      style={{ margin: 5 }}
                      variant="light"
                      onClick={() => {
                        handleStacChange("SUNC-ZWSO-PEWR");
                      }}
                    >
                      Test 1
                    </Button>
                    <Button
                      style={{ margin: 5 }}
                      variant="light"
                      onClick={() => {
                        handleStacChange("TKNM-GBOF-XHTN");
                      }}
                    >
                      Test 2
                    </Button>
                  </span>
                )}
              <h2>VerDIS - online</h2>
              <h3>Versiegelungsdaten | Flächenentwässerung</h3>
            </Container>
          </div>

          <div className="verdis-landing-bottom">
            <Container>
              <Row>
                <Col xs={12} md={6} className="verdis-landing-login-col">
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
