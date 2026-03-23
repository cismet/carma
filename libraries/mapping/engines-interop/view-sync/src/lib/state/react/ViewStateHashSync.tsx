import { useCallback, useEffect, useRef } from "react";
import { useViewState } from "./hooks";
import { encodeHashFromViewState, decodeHashToViewState } from "../core/hash-codec";
import type { CommonViewState } from "../core/types";

// ---------------------------------------------------------------------------
// ViewStateHashSync
//
// Reads hash on mount → pushes initial state.
// Writes hash only when `settled` flag is set (by adapter moveEnd events).
// Does NOT write hash on every state change.
// ---------------------------------------------------------------------------

type ViewStateHashSyncProps = {
  /** Whether the current interaction has settled (e.g. moveEnd fired). */
  settled: boolean;
  /** Read current hash params from URL. */
  readHash: () => Record<string, unknown>;
  /** Write hash params to URL. */
  writeHash: (params: Record<string, number>) => void;
  /** Push decoded state into the provider. */
  onInitialState?: (state: CommonViewState) => void;
  /** Default FOV in degrees for encode/decode. */
  defaultFovDeg?: number;
};

export const ViewStateHashSync = ({
  settled,
  readHash,
  writeHash,
  onInitialState,
  defaultFovDeg,
}: ViewStateHashSyncProps) => {
  const state = useViewState();
  const initializedRef = useRef(false);

  // --- Read hash on mount → decode → push initial state ---
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const hashValues = readHash();
    if (!hashValues || Object.keys(hashValues).length === 0) return;

    const decoded = decodeHashToViewState(hashValues, { defaultFovDeg });
    if (decoded && onInitialState) {
      onInitialState(decoded);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Write hash when settled ---
  useEffect(() => {
    if (!settled || !state) return;
    const params = encodeHashFromViewState(state, { defaultFovDeg });
    writeHash(params);
  }, [settled, state, writeHash, defaultFovDeg]);

  return null;
};
