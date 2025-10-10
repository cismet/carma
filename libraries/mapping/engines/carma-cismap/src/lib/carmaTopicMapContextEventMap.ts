import type {
  EmitFn as EmitFnGeneric,
  SubscribeFn as SubscribeFnGeneric,
} from "@carma-providers/event-bus";

export enum TopicMapCtxEvent {
  Activate = "Activate",
  Suspend = "Suspend",
  LocationChanged = "LocationChanged",
}

export type TopicMapContextEventMap = {
  [TopicMapCtxEvent.Suspend]: void;
  [TopicMapCtxEvent.Activate]: void;
  [TopicMapCtxEvent.LocationChanged]: {
    lat: number;
    lng: number;
    zoom: number;
  };
};

// Helper type aliases bound to the TopicMap context event map
export type SubscribeTopicMapCtxFn =
  SubscribeFnGeneric<TopicMapContextEventMap>;
export type EmitTopicMapCtxFn = EmitFnGeneric<TopicMapContextEventMap>;
