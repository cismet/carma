import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import localforage from "localforage";

export type AuthState = {
  jwt: string | undefined;
  user: string | undefined;
};

const initialState: AuthState = {
  jwt: undefined,
  user: undefined,
};

interface AuthContextType {
  jwt: string | undefined;
  user: string | undefined;
  setJWT: (jwt: string) => void;
  setUser: (user: string) => void;
  getJWT: () => string | undefined;
  getUser: () => string | undefined;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  storagePrefix?: string;
}

export function AuthProvider({
  children,
  storagePrefix = "auth",
}: AuthProviderProps) {
  const [auth, setAuth] = useState<AuthState>(initialState);

  // Initialize from localforage when component mounts
  useEffect(() => {
    async function loadFromStorage() {
      if (typeof window !== "undefined") {
        try {
          const storedJwt = await localforage.getItem<string>(
            `${storagePrefix}_jwt`
          );
          const storedUser = await localforage.getItem<string>(
            `${storagePrefix}_user`
          );

          if (storedJwt || storedUser) {
            setAuth({
              jwt: storedJwt || undefined,
              user: storedUser || undefined,
            });
          }
        } catch (error) {
          console.error("Error loading auth from localforage:", error);
        }
      }
    }

    loadFromStorage();
  }, []);

  const setJWT = useCallback((jwt: string) => {
    setAuth((prev) => ({ ...prev, jwt }));
    if (typeof window !== "undefined") {
      localforage.setItem(`${storagePrefix}_jwt`, jwt).catch((error) => {
        console.error("Error saving JWT to localforage:", error);
      });
    }
  }, []);

  const setUser = useCallback((user: string) => {
    setAuth((prev) => ({ ...prev, user }));
    if (typeof window !== "undefined") {
      localforage.setItem(`${storagePrefix}_user`, user).catch((error) => {
        console.error("Error saving user to localforage:", error);
      });
    }
  }, []);

  const getJWT = useCallback(() => auth.jwt, [auth]);
  const getUser = useCallback(() => auth.user, [auth]);

  const value = useMemo(
    () => ({
      jwt: auth.jwt,
      user: auth.user,
      setJWT,
      setUser,
      getJWT,
      getUser,
    }),
    [auth.jwt, auth.user, setJWT, setUser, getJWT, getUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
