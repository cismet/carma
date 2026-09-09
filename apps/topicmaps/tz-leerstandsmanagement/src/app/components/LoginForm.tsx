import { useEffect, useRef, useState } from "react";
import localforage from "localforage";
import { Button, Form, Input, Modal } from "antd";
import type { InputRef } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { APP_CONFIG } from "../../config/appConfig";

export interface LoginInfo {
  color: string;
  text: string;
}

interface LoginFormProps {
  onJwt: (jwt: string) => void;
  loginInfo?: LoginInfo;
  setLoginInfo: (info?: LoginInfo) => void;
}

export const LoginForm = ({ onJwt, loginInfo, setLoginInfo }: LoginFormProps) => {
  const [user, setUserState] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<InputRef>(null);

  const setUser = (value: string) => {
    localforage.setItem(APP_CONFIG.userStorageKey, value);
    setUserState(value);
  };

  useEffect(() => {
    (async () => {
      const cached = await localforage.getItem<string>(APP_CONFIG.userStorageKey);
      if (import.meta.env.DEV) {
        // devSecrets.json is git-ignored and only read in development
        try {
          const result = await fetch("devSecrets.json");
          if (result.ok) {
            const cheats = await result.json();
            if (cheats.cheatingUser) setUser(cheats.cheatingUser);
            if (cheats.cheatingPassword) setPw(cheats.cheatingPassword);
            return;
          }
        } catch {
          // no devSecrets.json, fall through to the cached user
        }
      }
      if (cached) setUserState(cached);
    })();
  }, []);

  const login = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${APP_CONFIG.restService}users`, {
        method: "GET",
        headers: {
          Authorization:
            "Basic " + btoa(user + "@" + APP_CONFIG.domain + ":" + pw),
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const json = await response.json();
        setLoginInfo({ color: "#79BD9A", text: "Anmeldung erfolgreich." });
        setTimeout(() => {
          onJwt(json.jwt);
          setLoginInfo(undefined);
        }, 300);
      } else {
        setLoginInfo({
          color: "#FF8048",
          text: "Anmeldung fehlgeschlagen. Bitte Login und Passwort prüfen.",
        });
        setTimeout(() => setLoginInfo(undefined), 3000);
      }
    } catch {
      setLoginInfo({
        color: "#FF3030",
        text: "Der Server ist nicht erreichbar.",
      });
      setTimeout(() => setLoginInfo(undefined), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      zIndex={3000000000}
      title={
        <span>
          <UserOutlined /> Anmeldung Leerstandsmanagement
        </span>
      }
    >
      <Form layout="vertical" onFinish={login}>
        <Form.Item label="WuNDa Benutzername">
          <Input
            value={user}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setUser(e.target.value)}
            onPressEnter={() => pwRef.current?.focus()}
            placeholder="Login"
          />
        </Form.Item>
        <Form.Item label="Passwort">
          <Input.Password
            ref={pwRef}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onPressEnter={login}
            placeholder="Passwort"
          />
        </Form.Item>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ color: loginInfo?.color ?? "inherit", fontWeight: 600 }}>
            {loginInfo?.text}
          </div>
          <Button type="primary" htmlType="submit" loading={busy}>
            Anmelden
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
