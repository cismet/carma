import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import localforage from "localforage";
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
  const pwRef = useRef<HTMLInputElement>(null);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) login();
  };

  return (
    <div className="ls-login" role="dialog" aria-modal="true" aria-label="Anmeldung">
      <div className="ls-login-col">
        {/* abstract map linework from the mockup: two streets, three buildings, one Leerstand */}
        <div className="ls-login-art" aria-hidden="true">
          <i style={{ left: -40, top: 120, width: 520, height: 16, background: "#fff", transform: "rotate(-6deg)" }} />
          <i style={{ left: 120, top: 0, width: 14, height: 400, background: "#fff" }} />
          <i style={{ left: 24, top: 170, width: 70, height: 90, outline: "1.5px solid #fff" }} />
          <i style={{ left: 170, top: 160, width: 120, height: 100, outline: "1.5px solid #fff" }} />
          <i style={{ left: 310, top: 190, width: 60, height: 120, outline: "1.5px solid #fff" }} />
          <i style={{ left: 196, top: 196, width: 28, height: 28, borderRadius: "50%", background: "#C8102E" }} />
        </div>

        <div className="ls-login-kicker">Stadt Wuppertal · DigiTal Zwilling</div>
        <h1 className="ls-login-title">Leerstands&shy;management</h1>
        <p className="ls-login-sub">Erfassung leerstehender Ladenlokale vor Ort.</p>

        <form className="ls-login-card" onSubmit={submit}>
          <label className="ls-lbl" htmlFor="ls-login-user">
            WuNDa Benutzername
          </label>
          <input
            id="ls-login-user"
            className="ls-inp"
            value={user}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            enterKeyHint="next"
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                pwRef.current?.focus();
              }
            }}
          />
          <label className="ls-lbl" htmlFor="ls-login-pw" style={{ marginTop: 16 }}>
            Passwort
          </label>
          <input
            id="ls-login-pw"
            ref={pwRef}
            className="ls-inp"
            type="password"
            value={pw}
            autoComplete="current-password"
            enterKeyHint="go"
            onChange={(e) => setPw(e.target.value)}
          />
          {loginInfo && (
            <div className="ls-login-msg" style={{ borderLeftColor: loginInfo.color }}>
              {loginInfo.text}
            </div>
          )}
          <button className="ls-btn ls-pri" type="submit" disabled={busy}>
            {busy ? "Anmeldung läuft …" : "Anmelden"}
          </button>
          <div className="ls-login-foot">
            Anmeldung bleibt auf diesem Gerät bestehen
          </div>
        </form>
      </div>
    </div>
  );
};
