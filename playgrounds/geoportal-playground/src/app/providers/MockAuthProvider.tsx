import { PropsWithChildren } from "react";
import { AuthProvider } from "@carma-providers/auth";

export const MockAuthProvider = ({
  children,
}: PropsWithChildren<Record<string, unknown>>) => {
  return (
    <AuthProvider storagePrefix="playground-auth">{children}</AuthProvider>
  );
};
