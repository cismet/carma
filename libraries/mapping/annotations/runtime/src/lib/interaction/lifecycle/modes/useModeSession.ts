import { useMemo } from "react";

import type { Cartesian3 } from "@carma/cesium";
type ModeSessionStageHandlers = {
  start: () => void;
  finish: () => boolean;
  discard: () => void;
  nodeCreated?: (id: string, positionECEF: Cartesian3) => void;
  finishesOnLoopClosure?: boolean;
};

type UseModeSessionParams<TToolType> = {
  toolType: TToolType;
} & ModeSessionStageHandlers;

type ModeSessionModel<TToolType> = {
  toolType: TToolType;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (id: string, positionECEF: Cartesian3) => void;
  finishesOnLoopClosure?: boolean;
};

export const useModeSession = <TToolType>({
  toolType,
  start,
  finish,
  discard,
  nodeCreated,
  finishesOnLoopClosure = false,
}: UseModeSessionParams<TToolType>): ModeSessionModel<TToolType> =>
  useMemo<ModeSessionModel<TToolType>>(
    () => ({
      toolType,
      requestStart: start,
      requestFinish: finish,
      discardDraft: discard,
      onNodeCreated: nodeCreated,
      finishesOnLoopClosure,
    }),
    [discard, finish, finishesOnLoopClosure, nodeCreated, start, toolType]
  );
