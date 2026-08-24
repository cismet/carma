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
