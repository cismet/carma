import {
  isShowNotice,
  showNoticeTarget,
  subscribeRelay,
  type RelayLink,
  type ShowNotice,
} from "@carma-mapping/show-remote";

/**
 * Listens to what pm-show says about the show under `key` (`ShowNotice`)
 * until the returned function is called. Every publish of it goes to
 * `onNotice`; a session nobody wrote to, or one about another show, is
 * nothing to hear.
 */
export const followShowNotice = (
  baseUrl: string,
  key: string,
  onNotice: (notice: ShowNotice) => void,
  link?: RelayLink
): (() => void) => {
  const subscription = subscribeRelay({
    target: showNoticeTarget(baseUrl, key),
    onState: (state) => {
      if (isShowNotice(state) && state.key.trim() === key.trim()) {
        onNotice(state);
      }
    },
    ...(link ? { link } : {}),
  });
  return subscription.stop;
};
