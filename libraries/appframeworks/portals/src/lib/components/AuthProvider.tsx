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
  userGroups: string[];
};

const initialState: AuthState = {
  jwt: undefined,
  user: undefined,
  userGroups: [],
};

interface AuthContextType {
  jwt: string | undefined;
  user: string | undefined;
  userGroups: string[];
  setJWT: (jwt: string) => void;
  setUser: (user: string) => void;
  setUserGroups: (userGroups: string[]) => void;
  getJWT: () => string | undefined;
  getUser: () => string | undefined;
  getUserGroups: () => string[];
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
          const storedUserGroups = await localforage.getItem<string[]>(
            `${storagePrefix}_userGroups`
          );

          if (storedJwt || storedUser) {
            setAuth({
              jwt: storedJwt || undefined,
              user: storedUser || undefined,
              userGroups: storedUserGroups || [],
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

  const setUserGroups = useCallback((userGroups: string[]) => {
    setAuth((prev) => ({ ...prev, userGroups }));
    if (typeof window !== "undefined") {
      localforage
        .setItem(`${storagePrefix}_userGroups`, userGroups)
        .catch((error) => {
          console.error("Error saving user groups to localforage:", error);
        });
    }
  }, []);

  const getUserGroups = useCallback(() => auth.userGroups, [auth]);

  const getJWT = useCallback(() => auth.jwt, [auth]);
  const getUser = useCallback(() => auth.user, [auth]);

  const value = useMemo(
    () => ({
      jwt: auth.jwt,
      user: auth.user,
      userGroups: auth.userGroups,
      setJWT,
      setUser,
      setUserGroups,
      getJWT,
      getUser,
      getUserGroups,
    }),
    [
      auth.jwt,
      auth.user,
      auth.userGroups,
      setJWT,
      setUser,
      setUserGroups,
      getJWT,
      getUser,
      getUserGroups,
    ]
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
