import type {
  NavigationMethods,
  NavigationOrbitOptions,
  NavigationTransitionOptions,
  NavigationZoomOptions,
} from "./navigation-methods";

export const NAVIGATION_ACTIONS = {
  SET_VIEW: "set-view",
  FLY_TO: "fly-to",
  GO_HOME: "go-home",
  ZOOM_IN: "zoom-in",
  ZOOM_OUT: "zoom-out",
  ORBIT: "orbit",
} as const;

export type NavigationActionType =
  (typeof NAVIGATION_ACTIONS)[keyof typeof NAVIGATION_ACTIONS];

export type NavigationAction<TView = unknown> =
  | {
      type: typeof NAVIGATION_ACTIONS.SET_VIEW;
      state: TView;
    }
  | {
      type: typeof NAVIGATION_ACTIONS.FLY_TO;
      state: TView;
      options?: NavigationTransitionOptions;
    }
  | {
      type: typeof NAVIGATION_ACTIONS.GO_HOME;
      options?: NavigationTransitionOptions;
    }
  | {
      type: typeof NAVIGATION_ACTIONS.ZOOM_IN;
      options?: NavigationZoomOptions;
    }
  | {
      type: typeof NAVIGATION_ACTIONS.ZOOM_OUT;
      options?: NavigationZoomOptions;
    }
  | {
      type: typeof NAVIGATION_ACTIONS.ORBIT;
      options?: NavigationOrbitOptions;
    };

export const runNavigationAction = <TView>(
  methods: NavigationMethods<TView>,
  action: NavigationAction<TView>
) => {
  switch (action.type) {
    case NAVIGATION_ACTIONS.SET_VIEW:
      methods.setView(action.state);
      return;
    case NAVIGATION_ACTIONS.FLY_TO:
      methods.flyTo(action.state, action.options);
      return;
    case NAVIGATION_ACTIONS.GO_HOME:
      methods.goHome(action.options);
      return;
    case NAVIGATION_ACTIONS.ZOOM_IN:
      methods.zoomIn(action.options);
      return;
    case NAVIGATION_ACTIONS.ZOOM_OUT:
      methods.zoomOut(action.options);
      return;
    case NAVIGATION_ACTIONS.ORBIT:
      methods.orbit(action.options);
      return;
  }
};
