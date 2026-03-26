import {
  applyToShareableHashValues,
  applyToShareableViewState,
  readFromShareableHashValues,
  readFromShareableViewState,
  type ShareableViewStateAdapterOptions,
} from "../../../adapters/shareable";
import type { ViewStateHashCodec } from "../../../core/types";

export type ViewStateShareableHashCodecOptions =
  ShareableViewStateAdapterOptions;

export const createViewStateShareableHashCodec = (
  options: ViewStateShareableHashCodecOptions = {}
): ViewStateHashCodec => ({
  encode: (state) => {
    if (!state) {
      return null;
    }

    const shareableViewState = applyToShareableViewState(state);
    return applyToShareableHashValues(
      shareableViewState,
      options
    );
  },
  decode: (hashValues) => {
    const shareableViewState = readFromShareableHashValues(
      hashValues,
      options
    );
    return shareableViewState
      ? readFromShareableViewState(shareableViewState, options)
      : null;
  },
});
