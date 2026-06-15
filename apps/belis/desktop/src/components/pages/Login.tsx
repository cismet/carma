import { Button, Form, Input } from "antd";
import React, { useEffect, useState } from "react";

import { useWindowSize } from "@react-hook/window-size";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { storeJWT, storeLogin, storePermissions } from "../../store/slices/auth";
import { resetKeyTablesFetched } from "../../store/slices/keyTables";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";

export const background = "belis_background_iStock-139701369_blurred.jpg";

interface LoginInfo {
  color: string;
  text: string;
}

const Login = () => {
  const windowSize = useWindowSize();
  const [form] = Form.useForm();
  const browserlocation = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);

  // Show the dev marker whenever this is not a live build. The live build is
  // stamped with `triggered: "live"` in version.json (same signal used by
  // getApplicationVersion); everything else (local dev, dev/PR builds) is dev.
  const isLiveVersion =
    (versionData as { triggered?: string | null }).triggered === "live";

  const windowHeight = windowSize[1];

  const loginPanelWidth = 400;

  const onFinishFailed = (errorInfo) => {
    console.log("Failed:", errorInfo);
  };

  const baseUrl = window.location.origin + window.location.pathname;
  const onFinish = (values) => {
    login(values.username, values.password);
  };

  const login = (user, pw) => {
    fetch(REST_SERVICE + "/users", {
      method: "GET",
      headers: {
        Authorization: "Basic " + btoa(user + "@" + DOMAIN + ":" + pw),
        "Content-Type": "application/json",
      },
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (responseWithJWT) {
            const jwt = responseWithJWT.jwt;
            // Server returns the user's groups as `userGroups`; we map it into
            // app-side `permissions` (used to derive read-only mode).
            const permissions = responseWithJWT.userGroups;
            setTimeout(() => {
              dispatch(resetKeyTablesFetched());
              navigate("/" + browserlocation.search);
              dispatch(storeJWT(jwt));
              dispatch(storeLogin(user));
              dispatch(storePermissions(permissions));
            }, 500);
          });
        } else {
          setLoginInfo({
            color: "#703014",
            text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
          });
          setTimeout(() => {
            setLoginInfo(null);
          }, 2500);
        }
      })
      .catch(function (err) {
        setLoginInfo({
          color: "#703014",
          text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
        });
        setTimeout(() => {
          setLoginInfo(null);
        }, 2500);
      });
  };
  return (
    <div
      style={{
        // background: "#dddddd",
        position: "relative",
        height: windowHeight,
        width: "100%",
        background: `url(${baseUrl}images/${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div className="absolute bottom-6 right-6 text-white/80 text-[11px] text-right max-w-[340px]">
        <b>BelISDesktop {getApplicationVersion(versionData)}</b>:{" "}
        <a href="https://cismet.de/" target="_cismet">
          cismet GmbH
        </a>{" "}
        auf Basis von{" "}
        <a href="https://maplibre.org/" target="_cismet">
          MapLibre
        </a>{" "}
        und{" "}
        <a href="https://github.com/cismet/carma" target="_cismet">
          carma
        </a>{" "}
        |{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://cismet.de/datenschutzerklaerung.html"
        >
          Datenschutzerklärung
        </a>{" "}
        |{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://cismet.de/impressum.html"
        >
          Impressum
        </a>
      </div>
      <div
        style={{
          width: loginPanelWidth,
          padding: 36,
          background: "rgba(255, 255, 255, 0.13)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          borderRadius: 16,
          border: "1px solid rgba(255, 255, 255, 0.55)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.45)",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#1f1f1f",
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          BelIS-Desktop
        </h1>
        {!isLiveVersion && (
          <div
            className="whitespace-nowrap"
            style={{ color: "#595959", fontSize: 13, marginTop: 2 }}
          >
            Entwicklungsversion
          </div>
        )}
        <div
          style={{
            minHeight: 21,
            color: loginInfo?.color || "transparent",
            fontSize: 13,
            marginTop: 12,
          }}
        >
          {loginInfo?.text || ""}
        </div>
        <Form
          form={form}
          name="basic"
          layout="vertical"
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          autoComplete="off"
          requiredMark={false}
          style={{ width: "100%" }}
        >
          <Form.Item
            label="Benutzer"
            name="username"
            rules={[
              {
                required: true,
                message: "Bitte geben Sie Ihren Benutzernamen an",
              },
            ]}
          >
            <Input size="large" autoFocus />
          </Form.Item>

          <Form.Item
            label="Passwort"
            name="password"
            rules={[
              { required: true, message: "Bitte geben Sie ein Passwort an." },
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" size="large" block>
              Login
            </Button>
          </Form.Item>
        </Form>
      </div>
      <div style={{ position: "absolute", top: 20, left: 30, opacity: 0.7 }}>
        <h1 style={{ color: "white" }}>
          <img alt="" width={180} src="/images/wuppertal-white.svg" />
        </h1>
      </div>
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          textAlign: "right",
          opacity: 0.85,
          textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
        }}
      >
        <h5 style={{ color: "white" }}>Stadt Wuppertal</h5>
        <h5 style={{ color: "white" }}>Straßen und Verkehr</h5>
        <h5 style={{ color: "white" }}>104.25 Öffentliche Beleuchtung</h5>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 30,
          opacity: 0.5,
          width: 300,
          textAlign: "right",
          color: "white",
        }}
      >
        {/* <VersionFooter linkStyling={{ color: "grey" }} /> */}
      </div>
    </div>
  );
};
export default Login;
