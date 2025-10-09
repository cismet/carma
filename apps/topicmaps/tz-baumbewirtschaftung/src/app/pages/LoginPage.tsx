import { Button, Form, Input } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import localforage from "localforage";
import { APP_CONFIG } from "../../config/appConfig";

const BACKGROUND_IMAGE = "yaron-cohen-jF4l0EMvqD4-unsplash.jpg";

const LoginPage = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginInfo, setLoginInfo] = useState<{
    color: string;
    text: string;
  } | null>(null);
  const [lastUser, setLastUser] = useState<string>("");

  const productionMode = import.meta.env.PROD;

  // Load last successful user and dev secrets
  useEffect(() => {
    (async () => {
      try {
        const storedUser = await localforage.getItem<string>(
          "@tz.baumbewirtschaftung.auth.user"
        );
        if (storedUser) {
          setLastUser(storedUser);
        }

        if (!productionMode) {
          const result = await fetch("devSecrets.json");
          const cheats = await result.json();
          console.log("devSecrets.json found");

          form.setFieldsValue({
            username: cheats.cheatingUser || storedUser || "",
            password: cheats.cheatingPassword || "",
          });
        } else {
          form.setFieldsValue({ username: storedUser || "" });
        }
      } catch (e) {
        console.log("no devSecrets.json found");
        form.setFieldsValue({ username: lastUser });
      }
    })();
  }, [productionMode, form, lastUser]);

  const onFinish = (values: { username: string; password: string }) => {
    login(values.username, values.password);
  };

  const login = async (user: string, pw: string) => {
    try {
      const response = await fetch(`${APP_CONFIG.restService}users`, {
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(`${user}@${APP_CONFIG.domain}:${pw}`),
          "Content-Type": "application/json",
        },
      });

      if (response.status >= 200 && response.status < 300) {
        const responseWithJWT = await response.json();
        const jwt = responseWithJWT.jwt;

        setLoginInfo({
          color: "#038643",
          text: "Anmeldung erfolgreich. Daten werden geladen.",
        });

        // Store JWT and username
        await localforage.setItem("@tz.baumbewirtschaftung.auth.jwt", jwt);
        await localforage.setItem("@tz.baumbewirtschaftung.auth.user", user);

        setTimeout(() => {
          navigate("/app" + location.search);
          setLoginInfo(null);
        }, 500);
      } else {
        setLoginInfo({
          color: "#703014",
          text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
        });
        setTimeout(() => {
          setLoginInfo(null);
        }, 2500);
      }
    } catch (err) {
      setLoginInfo({
        color: "#703014",
        text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
      });
      setTimeout(() => {
        setLoginInfo(null);
      }, 2500);
    }
  };

  const baseUrl = window.location.origin + window.location.pathname;

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        background: `url(${baseUrl}images/${BACKGROUND_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 10,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 450,
          background: "#ffffff55",
          borderRadius: 25,
          backdropFilter: "blur(10px)",
          padding: 20,
        }}
      >
        <h1
          style={{
            padding: 5,
            color: "#333333",
            paddingBottom: 4,
          }}
        >
          Baumbewirtschaftung
        </h1>
        <div
          style={{
            minHeight: 21,
            color: loginInfo?.color || "white",
            marginRight: 10,
            fontWeight: "bold",
          }}
        >
          {loginInfo?.text || ""}
        </div>
        <Form
          form={form}
          name="basic"
          onFinish={onFinish}
          autoComplete="off"
          style={{
            justifyContent: "left",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "left",
          }}
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
            <Input />
          </Form.Item>

          <Form.Item
            label="Passwort"
            name="password"
            rules={[
              { required: true, message: "Bitte geben Sie ein Passwort an." },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <div style={{ width: "100%" }}>
            <Form.Item style={{ float: "right" }}>
              <Button type="primary" htmlType="submit">
                Login
              </Button>
            </Form.Item>
          </div>
        </Form>
      </div>

      {/* Wuppertal Logo */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 30,
          opacity: 0.7,
        }}
      >
        <img
          alt="Wuppertal Logo"
          width={180}
          src="/images/wuppertal-white.svg"
        />
      </div>

      {/* Department Info */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          textAlign: "right",
          opacity: 0.7,
        }}
      >
        <h5 style={{ color: "white" }}>Stadt Wuppertal</h5>
        <h5 style={{ color: "white" }}>Ressort 103 - Umweltschutz</h5>
      </div>
    </div>
  );
};

export default LoginPage;
