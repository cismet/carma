import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import localforage from "localforage";

export interface AuthContextType {
  jwt: string | null;
  login: string | null;
  isAuthenticated: boolean;
  setAuth: (jwt: string, login: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getUserFromJWT = (jwt: string): string | null => {
  try {
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    // Prefer `preferred_username` or `sub` as a fallback
    return payload.preferred_username || payload.sub || null;
  } catch {
    return null;
  }
};

const JWT_KEY = "tz-baum-jwt";
const LOGIN_KEY = "tz-baum-login";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [jwt, setJwt] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const storedJwt = await localforage.getItem<string>(JWT_KEY);
        const storedLogin = await localforage.getItem<string>(LOGIN_KEY);
        if (storedJwt) setJwt(storedJwt);
        if (storedLogin) setLogin(storedLogin);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setAuth = async (newJwt: string, newLogin: string) => {
    setJwt(newJwt);
    setLogin(newLogin);
    await localforage.setItem(JWT_KEY, newJwt);
    await localforage.setItem(LOGIN_KEY, newLogin);
  };

  const logout = async () => {
    setJwt(null);
    setLogin(null);
    await localforage.removeItem(JWT_KEY);
    await localforage.removeItem(LOGIN_KEY);
  };

  if (loading) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{ jwt, login, isAuthenticated: !!jwt, setAuth, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
