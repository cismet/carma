import { useCallback, useEffect, useMemo, useState } from "react";
import localforage from "localforage";
import { AuthContext } from "./AuthContext";

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
  }, [storagePrefix]);

  const setJWT = useCallback(
    (jwt: string) => {
      setAuth((prev) => ({ ...prev, jwt }));
      if (typeof window !== "undefined") {
        localforage.setItem(`${storagePrefix}_jwt`, jwt).catch((error) => {
          console.error("Error saving JWT to localforage:", error);
        });
      }
    },
    [storagePrefix]
  );

  const setUser = useCallback(
    (user: string) => {
      setAuth((prev) => ({ ...prev, user }));
      if (typeof window !== "undefined") {
        localforage.setItem(`${storagePrefix}_user`, user).catch((error) => {
          console.error("Error saving user to localforage:", error);
        });
      }
    },
    [storagePrefix]
  );

  const setUserGroups = useCallback(
    (userGroups: string[]) => {
      setAuth((prev) => ({ ...prev, userGroups }));
      if (typeof window !== "undefined") {
        localforage
          .setItem(`${storagePrefix}_userGroups`, userGroups)
          .catch((error) => {
            console.error("Error saving user groups to localforage:", error);
          });
      }
    },
    [storagePrefix]
  );

  const getUserGroups = useCallback(() => auth.userGroups, [auth.userGroups]);

  const getJWT = useCallback(() => auth.jwt, [auth.jwt]);
  const getUser = useCallback(() => auth.user, [auth.user]);

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
