import { createNamespace } from "./create-namespace";

/**
 * Structural mirror of the fuzzy-search source config. carma-api is
 * dependency-free on purpose, so `topic` is a plain string (the endpoint
 * keyword); the bridge adapts contributions to the real gazetteer types.
 */
export type GazetteerSource = {
  topic: string;
  url: string;
  crs: string;
};

/**
 * Structural mirror of the fuzzy-search additional-mode config. A mode brings
 * either `sources` to search over, or a `resolve` that answers every input
 * itself; the return value is the search's own group/option shape, which this
 * package does not model.
 */
export type GazetteerMode = {
  key: string;
  label: string;
  icon?: unknown;
  svgIcon?: string;
  iconSize?: number;
  showAllOnFocus?: boolean;
  placeholder?: string;
  sources?: GazetteerSource[];
  resolve?: (input: string) => Promise<unknown>;
  /**
   * The leading part of the input that is a fixed label rather than something
   * the user typed, e.g. the category picked in a first stage; the search draws
   * it in the grey it draws its own fixed labels in.
   */
  inputPrefixOf?: (input: string) => string | null;
  /**
   * Ask the search to resolve an input again; returns an unsubscribe. The
   * options let the mode put its own stage back into the input and have the
   * answer shown, for a rerun the user did not type.
   */
  subscribe?: (
    rerun: (options?: { input?: string; open?: boolean }) => void
  ) => () => void;
};

export type GazetteerContribution = {
  sources?: GazetteerSource[];
  additionalModes?: GazetteerMode[];
};

/**
 * Raw injection point for the `gazetteer` namespace. The bridge provides the
 * closure on top of the gaz data provider's contribution api.
 */
export interface GazetteerAdapter {
  registerContribution: (contribution: GazetteerContribution) => () => void;
}

/** Public shape seen by callers of `carma.gazetteer`. */
export interface GazetteerFacade {
  addSource: (source: GazetteerSource) => () => void;
  addMode: (mode: GazetteerMode) => () => void;
}

const noop = () => {};

export const { facade: gazetteer, register: registerGazetteer } =
  createNamespace<GazetteerAdapter, GazetteerFacade>((get) => ({
    addSource: (source) =>
      get()?.registerContribution({ sources: [source] }) ?? noop,
    addMode: (mode) =>
      get()?.registerContribution({ additionalModes: [mode] }) ?? noop,
  }));
