import localforage from "localforage";
import { useContext, useEffect, useRef, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import IconComp from "react-cismap/commons/Icon";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { CACHE_JWT } from "react-cismap/tools/fetching";
import { APP_CONFIG } from "../../config/appConfig";

const appKey = "tz.baumbewirtschaftung";

const LoginForm = ({
  setJWT = (jwt) => {
    /* eslint no-console: "off" */
    console.log("setJWT not provided in <LoginForm>", jwt);
  },
  loginInfo,
  setLoginInfo = () => {},
}) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const pwFieldRef = useRef();
  const userFieldRef = useRef();
  const _height = (windowSize?.height || 800) - 180;
  const modalBodyStyle = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: _height,
  };
  const [user, _setUser] = useState("");
  const [pw, setPw] = useState("");
  const [cacheDataAvailable, setCacheDataAvailable] = useState(false);

  const setUser = (val) => {
    localforage.setItem("@" + appKey + ".auth.user", val);
    _setUser(val);
  };

  useEffect(() => {
    (async () => {
      const userInCache = await localforage.getItem(
        "@" + appKey + ".auth.user"
      );
      // If you want to enable offline mode indicator, compute and check your data cache key here
      // setCacheDataAvailable(Boolean(await localforage.getItem(<your-cache-key>)));
      setCacheDataAvailable(false);

      // Try to load devSecrets in development mode
      if (process.env.NODE_ENV !== "production") {
        try {
          const result = await fetch("devSecrets.json");
          const cheats = await result.json();
          console.log("devSecrets.json found");

          if (cheats.cheatingUser) {
            setUser(cheats.cheatingUser);
          }
          if (cheats.cheatingPassword) {
            setPw(cheats.cheatingPassword);
          }
        } catch (e) {
          console.log("no devSecrets.json found");
          // Fall back to cached user
          if (userInCache) {
            setUser(userInCache);
          }
        }
      } else {
        // Production mode - just use cached user
        if (userInCache) {
          setUser(userInCache);
        }
      }

      if (userFieldRef?.current) {
        userFieldRef.current.focus();
        userFieldRef.current.select();
      }
    })();
  }, []);

  const login = () => {
    fetch(`${APP_CONFIG.restService}users`, {
      method: "GET",
      headers: {
        Authorization:
          "Basic " + btoa(user + "@" + APP_CONFIG.domain + ":" + pw),
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          response.json().then((responseWithJWT) => {
            const jwt = responseWithJWT.jwt;
            setLoginInfo({
              color: "#79BD9A",
              text: "Anmeldung erfolgreich. Daten werden geladen.",
            });
            setTimeout(() => {
              setJWT(jwt);
              setLoginInfo();
            }, 500);
          });
        } else {
          setLoginInfo({
            color: "#FF8048",
            text: "Bei der Anmeldung ist ein Fehler aufgetreten. ",
          });
          setTimeout(() => {
            setLoginInfo();
          }, 2500);
        }
      })
      .catch(() => {
        setLoginInfo({
          color: "#FF3030",
          text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
        });
        setTimeout(() => {
          setLoginInfo();
        }, 2500);
      });
  };

  return (
    <Modal
      style={{ zIndex: 3000000000 }}
      height="100%"
      size="l"
      show={true}
      keyboard={false}
    >
      <Modal.Header>
        <Modal.Title>
          <div>
            <div>
              <IconComp name={"user"} /> Anmeldung
            </div>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body
        style={modalBodyStyle}
        id="tz-baumbewirtschaftung-login"
        key="login"
      >
        <Form>
          <Form.Group controlId="tz-baum-login">
            <Form.Label>WuNDa Benutzername</Form.Label>
            <Form.Control
              value={user}
              ref={userFieldRef}
              onChange={(e) => setUser(e.target.value)}
              onKeyPress={(event) => {
                if (event.key === "Enter") {
                  if (pwFieldRef.current) {
                    pwFieldRef.current.focus();
                  }
                }
              }}
              placeholder="Login hier eingeben"
            />
          </Form.Group>

          <Form.Group controlId="tz-baum-pass">
            <Form.Label>Passwort</Form.Label>
            <Form.Control
              ref={pwFieldRef}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              placeholder="Password"
              onKeyPress={(event) => {
                if (event.key === "Enter") {
                  login();
                }
              }}
            />
          </Form.Group>

          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "baseline",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            {loginInfo?.text && (
              <div
                style={{
                  margin: 10,
                  color: loginInfo?.color || "black",
                  maxWidth: 200,
                }}
              >
                <b>{loginInfo?.text}</b>
              </div>
            )}
            <div style={{ flexShrink: 100 }}></div>
            <div>
              {cacheDataAvailable === true && (
                <Button
                  onClick={() => {
                    setLoginInfo({
                      color: "#79BD9A",
                      text: "Alte Daten werden aus dem Cache übernommen.",
                    });
                    setTimeout(() => {
                      setJWT(CACHE_JWT);
                      setLoginInfo();
                    }, 500);
                  }}
                  style={{ margin: 5, marginTop: 30 }}
                  variant="secondary"
                >
                  Offline arbeiten
                </Button>
              )}
              <Button
                onClick={() => login()}
                style={{ margin: 5, marginTop: 30 }}
                variant="primary"
              >
                Anmeldung
              </Button>
            </div>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default LoginForm;
