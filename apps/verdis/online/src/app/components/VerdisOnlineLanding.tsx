import { Alert, AlertContainer } from "react-bs-notifier";
import { Form, FormGroup, Row, Col, Button, Container } from "react-bootstrap";
import Loadable from "react-loading-overlay-ts";
import MaskedFormControl from "react-bootstrap-maskedinput";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getKassenzeichenbySTAC } from "../../store/slices/kassenzeichen";
import { getLoginInProgress, getLoginInfoText } from "../../store/slices/auth";
import { useNavigate } from "react-router-dom";
import { getConfData, getUiState } from "../../store/slices/ui";
import {
  Kontaktinformationen,
  VersionNumberLoginPage,
} from "@carma-collab/wuppertal/verdis-online";
import type { UnknownAction } from "redux";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";
const VerdisOnlineLanding = () => {
  const [stac, setStac] = useState("");
  const [loginAlertVisible, setLoginAlertVisible] = useState(false);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const dispatch = useDispatch();
  const loginInProgress = useSelector(getLoginInProgress);
  const loginInfoText = useSelector(getLoginInfoText);
  const confData = useSelector(getConfData);
  const navigate = useNavigate();
  const uiState = useSelector(getUiState);
  let landingStyle = {
    backgroundColor: "red",
    height: uiState.height,
    width: "100%",
    background: "url('/images/" + "background.jpg" + "')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
  const panelStyle = {
    backgroundColor: "rgba(255,255,255,1)",
    border: 0,
    paddingLeft: 40,
    paddingRight: 40,
    paddingBottom: 10,
    paddingTop: 10,
  };

  const handleStacInput = (e) => {
    setStac(e.target.value);
    handleStacChange(e.target.value);
  };

  const handleStacChange = (rawStac) => {
    setStac(rawStac);
    if (rawStac) {
      console.log("xxx", rawStac);
      let stac = rawStac.trim().replace(/[- ]/g, "");
      if (stac.length === 12) {
        dispatch(
          getKassenzeichenbySTAC(stac, (success) => {
            if (success === true) {
              setTimeout(() => {
                const verificationCode = "";
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
          }) as unknown as UnknownAction,
        );
      }
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "100%",
          height: "200px",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "0px",
          left: "0px",
          width: "100%",
          height: "250px",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "0px",
          left: "0px",
          width: "100%",

          backgroundColor: "rgba(0,0,0,0)",
        }}
      >
        <div
          style={{
            fontSize: "9px",
            textAlign: "right",
            color: "rgba(256,256,256,0.5)",
            margin: 4,
          }}
        >
          {/* {getVersion()} */}
        </div>
      </div>
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
              confData.messages.map((message, index) => {
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

      <div style={{ ...landingStyle, paddingTop: "1.5rem" }}>
        <Container>
          <Row className="show-grid">
            <Col xs={12} md={12}>
              <h1 style={{ color: "white" }}>
                <img alt="" width={180} src="/images/wuppertal-white.svg" />
              </h1>
              {/* {getVersion() === "dev-hot-reload" &&
                                    process.env.NODE_ENV === "development" && (
                                        <span>
                                            <Button
                                                style={{ margin: 5 }}
                                                onClick={() => {
                                                    this.handleSTAC("STACSTACSTAC");
                                                }}
                                            >
                                                Rathaus
                                            </Button>
                                            <Button
                                                style={{ margin: 5 }}
                                                onClick={() => {
                                                    this.handleSTAC("SUNC-ZWSO-PEWR");
                                                }}
                                            >
                                                Test 1
                                            </Button>
                                            <Button
                                                style={{ margin: 5 }}
                                                onClick={() => {
                                                    this.handleSTAC("TKNM-GBOF-XHTN");
                                                }}
                                            >
                                                Test 2
                                            </Button>
                                        </span>
                                    )} */}
              <h2 style={{ color: "white" }}>VerDIS - online</h2>
              <h3 style={{ color: "white" }}>
                Versiegelungsdaten | Flächenentwässerung
              </h3>
            </Col>
          </Row>

          <Row className="show-grid">
            <Col xs={6} md={6}>
              <div
                style={{
                  position: "fixed",
                  top: uiState.height - 200,
                }}
              >
                <Loadable active={loginInProgress} spinner text={loginInfoText}>
                  <div
                    style={{
                      ...panelStyle,
                      marginBottom: 20,
                      borderRadius: 4,
                      boxShadow: "0 1px 2px rgba(0, 0, 0, .05)",
                    }}
                  >
                    <div style={{ padding: 15 }}>
                      <h3>Zugangscode:</h3>
                      <Form
                        // horizontal
                        className="LoginForm"
                        id="loginForm"
                        onSubmit={(e) => {
                          e.preventDefault();
                        }}
                      >
                        <FormGroup controlId="stacInput">
                          <MaskedFormControl
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
            <Col xs={1} md={1} />

            <Col xs={5} md={5}>
              <div
                style={{
                  position: "fixed",
                  top: uiState.height - 200,
                }}
              >
                <Kontaktinformationen />
              </div>
            </Col>
          </Row>
        </Container>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            color: "white",
            fontSize: "9px",
            marginLeft: "auto",
            paddingRight: "4px",
            paddingBottom: "4px",
          }}
        >
          <VersionNumberLoginPage
            version={getApplicationVersion(versionData)}
            fonntSize="9px"
          />
        </div>
      </div>
    </div>
  );
};

export default VerdisOnlineLanding;
