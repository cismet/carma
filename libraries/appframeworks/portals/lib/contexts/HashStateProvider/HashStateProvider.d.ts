import { default as React } from "react";
interface HashUpdateOptions {
  clearKeys?: string[];
  label?: string;
  replace?: boolean;
}
export type HashCodec<T = unknown> = {
  name?: string;
  decode: (value: string | undefined) => T;
  encode: (value: T) => string | undefined;
};
export type HashCodecs = Record<string, HashCodec>;
export type HashKeyAliases = Record<string, string>;
export type HashChangeSource = "update" | "popstate" | "hashchange";
export type HashChangeEvent = {
  raw: Record<string, string>;
  values: Record<string, unknown>;
  changedKeys: string[];
  removedKeys: string[];
  label?: string;
  replace?: boolean;
  source: HashChangeSource;
};
export type HashSubscribeOptions = {
  keys?: string[];
  labels?: string[];
};
export interface HashFieldConfig {
  hashParamKey: string;
  propertyName?: string;
  codec?: {
    encode?: (value: unknown) => string | undefined;
    decode?: (value: string | undefined) => unknown;
  };
}
export type HashStateConfig = HashFieldConfig[];
interface HashStateContextType {
  hashParams: Record<string, string>;
  getHash: () => Record<string, string>;
  getHashValues: () => Record<string, unknown>;
  updateHash: (
    params: Record<string, unknown> | undefined,
    options?: HashUpdateOptions
  ) => void;
  onHashInitialized: (
    callback: (hashValues: Record<string, unknown>) => void
  ) => void;
}
interface HashStateProviderProps {
  children: React.ReactNode;
  config?: HashStateConfig;
}
export declare const HashStateProvider: ({
  children,
  config,
}: HashStateProviderProps) => import("react/jsx-runtime").JSX.Element;
export declare function useHashState(): HashStateContextType;
export {};
