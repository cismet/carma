/**
 * When the time slider's clock may move, and when a playing series asks for
 * the frames it lost once more. Kept apart from the component so the rules can
 * be tested without a map.
 */

/** where the crossfade's frames stand for the current viewport */
export type FrameStatus = {
  /** whether the caged crossfade runs in this build */
  isBlending: boolean;
  /** whether frames load through `frame-fetch.ts`, see `cacheFrames` */
  cacheFrames: boolean;
  /** time steps in the series */
  total: number;
  loaded: number;
  /** frames given up on since the last reset */
  failed: number;
};

/**
 * Rounds of asking again per press of play. Each failed frame already had its
 * retries in `frame-fetch.ts` before it counts as failed, so a round is only
 * worth it for a WMS that was down for a while, not for one that is broken.
 */
export const MAX_FRAME_REQUEST_ROUNDS = 2;

const isComplete = ({ total, loaded }: FrameStatus) =>
  total > 0 && loaded >= total;

const isSettled = ({ total, loaded, failed }: FrameStatus) =>
  loaded + failed >= total;

/**
 * Whether the clock may advance.
 *
 * Without cage it always may: the tiles are all there is. With frames from the
 * http cache (the outlet, pm-show) it waits for every one of them: played on
 * the tiles instead, every step is a fresh load that is dropped for the next
 * one before it is in, and the map stays empty until a pause. Otherwise, with
 * frames that are not asked for again, it waits for them to come back loaded
 * or failed and then plays on the tiles if one is missing.
 */
export const clockMayRun = (status: FrameStatus): boolean => {
  if (!status.isBlending) return true;
  if (status.cacheFrames) return isComplete(status);
  return isSettled(status);
};

/**
 * Whether the frames that failed are asked for again now: while playing, once
 * nothing is in flight any more, and at most `MAX_FRAME_REQUEST_ROUNDS` times
 * per press of play. Only where the clock waits for them.
 */
export const shouldRequestFailedFrames = (
  status: FrameStatus,
  isPlaying: boolean,
  roundsUsed: number
): boolean =>
  status.isBlending &&
  status.cacheFrames &&
  isPlaying &&
  status.failed > 0 &&
  isSettled(status) &&
  roundsUsed < MAX_FRAME_REQUEST_ROUNDS;
