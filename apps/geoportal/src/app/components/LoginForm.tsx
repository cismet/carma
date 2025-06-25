import { faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "antd";
import "./login.css";
import { useRef, useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useAuth } from "@carma-apps/portals";

interface LoginFormProps {
  helpText?: string;
  onSuccess?: () => void;
  closeLoginForm?: () => void;
  showHelpText?: boolean;
  style?: React.CSSProperties;
}

const LoginForm = ({
  helpText,
  onSuccess,
  closeLoginForm,
  showHelpText = true,
  style,
}: LoginFormProps) => {
  const { user, setJWT, setUser } = useAuth();
  const [userName, setUserName] = useState(user || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);

  const formRef = useRef<HTMLFormElement>(null);
  const [formWidth, setFormWidth] = useState<number>(0);

  useEffect(() => {
    const updateFormWidth = () => {
      if (formRef.current) {
        setFormWidth(formRef.current.clientWidth);
      }
    };

    updateFormWidth();

    window.addEventListener("resize", updateFormWidth);

    return () => window.removeEventListener("resize", updateFormWidth);
  }, []);

  const dispatch = useDispatch();

  const login = (e) => {
    e.preventDefault();
    setLoading(true);
    fetch("https://wunda-cloud-api.cismet.de/users", {
      method: "GET",
      headers: {
        Authorization:
          "Basic " + btoa(userName + "@" + "WUNDA_BLAU" + ":" + password),
        "Content-Type": "application/json",
      },
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (responseWithJWT) {
            const jwt = responseWithJWT.jwt;

            setTimeout(() => {
              setJWT(jwt);
              setUser(userName);
            }, 500);
            setTimeout(() => {
              onSuccess?.();
              setLoading(false);
            }, 1000);
          });
        } else {
          setLoading(false);
          setError(true);
          setTimeout(() => {
            setError(false);
          }, 2000);
        }
      })
      .catch(function (err) {
        setLoading(false);
        setError(true);
        setTimeout(() => {
          setError(false);
        }, 2000);
      });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        gap: "4px",
        background: "#155A5F20",
        padding: "1rem",
        marginBottom: "1rem",
        borderRadius: "0.5rem",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "1rem",
        }}
      >
        <FontAwesomeIcon size="lg" icon={faUser} />{" "}
        <h4 style={{ marginBottom: "0px" }}>Anmeldung</h4>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "20px",
        }}
      >
        {showHelpText && (
          <p style={{ width: "50%" }}>
            {helpText
              ? helpText
              : `Diese Anmeldemaske ist für Personen mit Zugriff auf WuNDa vorgesehen.
          Nach dem erfolgreichen Login werden zusätzliche Funktionen des
          Geoportals freigeschaltet, die ausschließlich intern nutzbar sind – darunter erweiterte Werkzeuge und spezielle Datenzugriffe.`}
          </p>
        )}
        <form
          onSubmit={login}
          style={{ width: showHelpText ? "50%" : "100%" }}
          ref={formRef}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontWeight: "700" }} htmlFor="username">
                WuNDa Benutzername
              </label>
              <input
                type="text"
                id="username"
                placeholder="Login hier eingeben"
                className="login-input"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontWeight: "700" }} htmlFor="password">
                Passwort
              </label>
              <input
                type="password"
                id="password"
                placeholder="Passwort hier eingeben"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexDirection: formWidth < 361 ? "column" : "row",
              }}
            >
              <Button
                onClick={closeLoginForm}
                type="default"
                style={{
                  width: formWidth < 361 ? "100%" : "50%",
                }}
              >
                Ohne Anmeldung fortfahren
              </Button>
              <Button
                loading={loading}
                htmlType="submit"
                type="primary"
                style={{
                  width: formWidth < 361 ? "100%" : "50%",
                }}
              >
                Anmeldung
              </Button>
            </div>
            {error && (
              <div style={{ color: "red" }}>
                <b>Bei der Anmeldung ist ein Fehler aufgetreten</b>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
