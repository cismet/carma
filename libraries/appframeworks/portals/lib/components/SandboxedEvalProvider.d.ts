import { default as React } from "react";
export type SandboxedEval = (
  code: string,
  payload?: unknown
) => Promise<unknown>;
export declare function sandboxedEvalExternal(
  code: string,
  payload?: unknown
): Promise<unknown>;
export declare function SandboxedEvalProvider({
  children,
}: {
  children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useSandboxedEval(): SandboxedEval;
