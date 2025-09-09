import { createContext } from "react";

export interface AuthContextType {
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
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
