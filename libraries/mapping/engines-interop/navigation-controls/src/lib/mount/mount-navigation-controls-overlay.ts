import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ACTIONS,
  NAVIGATION_ORBIT_DIRECTIONS,
  NAVIGATION_ORBIT_TARGETS,
  runNavigationAction,
  type NavigationNeedleOrientationDeg,
  type NavigationMethods,
  type NavigationOrbitOptions,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "../contracts";
import {
  createCameraZoomIconElement,
  createCompassNeedleController,
  createCompassNeedleElement,
  createFovZoomIconElement,
  createOrbitIconController,
  createOrbitIconElement,
  mountSceneNavigationControls,
  type SceneNavigationDomConfig,
} from "../dom";

const DEFAULT_CONTROL_STYLE: NonNullable<SceneNavigationDomConfig["style"]> = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const DEFAULT_ORBIT_OPTIONS: NavigationOrbitOptions = {
  target: NAVIGATION_ORBIT_TARGETS.CURRENT_VIEW,
  durationMs: 300,
  direction: NAVIGATION_ORBIT_DIRECTIONS.CW,
  revolutionDurationSec: DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  minPitchDeg: 30,
};
const COMPASS_DRAG_FACTOR_DEG_PER_PX = 0.3;
const COMPASS_DRAG_THRESHOLD_PX = 3;
const COMPASS_CLICK_DELAY_MS = 180;
const DEFAULT_MAX_COMPASS_PITCH_DEG = 85;

export type NavigationControlsOverlayMessages = {
  homeTooltip: string;
  homeTitle: string;
  orbitTooltip: string;
  orbitTitle: string;
  zoomInTooltip: string;
  zoomInTitle: string;
  zoomOutTooltip: string;
  zoomOutTitle: string;
  compassTooltip: string;
  compassDisabledTooltip: string;
  compassTitle: string;
};

const DEFAULT_MESSAGES: NavigationControlsOverlayMessages = {
  homeTooltip: "Go to home view",
  homeTitle: "Home",
  orbitTooltip: "Orbit around the current focus point",
  orbitTitle: "Orbit",
  zoomInTooltip: "Zoom in",
  zoomInTitle: "Zoom in",
  zoomOutTooltip: "Zoom out",
  zoomOutTitle: "Zoom out",
  compassTooltip: "Click: north. Double click: north plus nadir.",
  compassDisabledTooltip: "Compass disabled",
  compassTitle: "Compass",
};

export type MountNavigationControlsOverlayOptions<TView> = {
  controlId: string;
  methods: NavigationMethods<TView>;
  disabled?: boolean;
  showOrbitControl?: boolean;
  style?: NonNullable<SceneNavigationDomConfig["style"]>;
  messages?: Partial<NavigationControlsOverlayMessages>;
  homeOptions?: NavigationTransitionOptions;
  orbitOptions?: NavigationOrbitOptions;
  zoomInOptions?: NavigationZoomOptions;
  zoomOutOptions?: NavigationZoomOptions;
  secondaryZoomGroup?: {
    zoomInOptions?: NavigationZoomOptions;
    zoomOutOptions?: NavigationZoomOptions;
    zoomInTooltip?: string;
    zoomOutTooltip?: string;
    zoomInContent?: HTMLElement | SVGSVGElement;
    zoomOutContent?: HTMLElement | SVGSVGElement;
    zoomInDisabled?: boolean;
    zoomOutDisabled?: boolean;
  } | null;
  tertiaryZoomGroup?: {
    zoomInOptions?: NavigationZoomOptions;
    zoomOutOptions?: NavigationZoomOptions;
    zoomInTooltip?: string;
    zoomOutTooltip?: string;
    zoomInContent?: HTMLElement | SVGSVGElement;
    zoomOutContent?: HTMLElement | SVGSVGElement;
    zoomInDisabled?: boolean;
    zoomOutDisabled?: boolean;
  } | null;
};

export const mountNavigationControlsOverlay = <TView>(
  host: HTMLElement,
  {
    controlId,
    methods,
    disabled = false,
    showOrbitControl = false,
    style = DEFAULT_CONTROL_STYLE,
    messages,
    homeOptions,
    orbitOptions,
    zoomInOptions,
    zoomOutOptions,
    secondaryZoomGroup = null,
    tertiaryZoomGroup = null,
  }: MountNavigationControlsOverlayOptions<TView>
) => {
  const resolvedOrbitOptions = {
    ...DEFAULT_ORBIT_OPTIONS,
    ...orbitOptions,
  };
  const resolvedMessages = {
    ...DEFAULT_MESSAGES,
    ...messages,
  };

  const showCompass = methods.showCompass !== false;
  let stopNeedleSync = () => {};
  let destroyNeedle = () => {};
  let clearCompassDrag = () => {};
  let pendingCompassClickTimeoutId: number | null = null;
  let didCompassDrag = false;
  let compassContent: SVGSVGElement | undefined;
  let orbitContent: SVGSVGElement | undefined;
  let latestCompassOrientation: NavigationNeedleOrientationDeg = {
    headingDeg: 0,
    pitchDeg: 0,
  };
  let stopOrbitSync = () => {};
  let destroyOrbitIcon = () => {};
  let syncNeedleOrientation: ReturnType<
    typeof createCompassNeedleController
  > | null = null;
  let syncOrbitIcon: ReturnType<typeof createOrbitIconController> | null = null;

  const clearPendingCompassClick = () => {
    if (pendingCompassClickTimeoutId !== null) {
      window.clearTimeout(pendingCompassClickTimeoutId);
      pendingCompassClickTimeoutId = null;
    }
  };

  if (showCompass) {
    const needleElement = createCompassNeedleElement();
    const needleController = createCompassNeedleController(needleElement);

    compassContent = needleElement;
    syncNeedleOrientation = needleController;
    destroyNeedle = () => {
      needleController.destroy();
    };
  }

  if (showOrbitControl && methods.canOrbit) {
    const orbitIconElement = createOrbitIconElement();
    const orbitIconController = createOrbitIconController(orbitIconElement, {
      mirrored:
        resolvedOrbitOptions.direction === NAVIGATION_ORBIT_DIRECTIONS.CW ||
        (typeof resolvedOrbitOptions.direction !== "string" &&
          typeof resolvedOrbitOptions.bearingDeltaDeg === "number" &&
          Number.isFinite(resolvedOrbitOptions.bearingDeltaDeg) &&
          resolvedOrbitOptions.bearingDeltaDeg > 0),
    });

    orbitContent = orbitIconElement;
    syncOrbitIcon = orbitIconController;
    destroyOrbitIcon = () => {
      orbitIconController.destroy();
    };

    if (methods.subscribeOrbitActive) {
      stopOrbitSync = methods.subscribeOrbitActive((active) => {
        orbitIconController.setActive(active);
      });
    }
  }

  if (
    methods.subscribeCompassOrientation &&
    (syncNeedleOrientation !== null || syncOrbitIcon !== null)
  ) {
    stopNeedleSync = methods.subscribeCompassOrientation((orientation) => {
      latestCompassOrientation = orientation;
      syncNeedleOrientation?.setOrientation(orientation);
      syncOrbitIcon?.setBearingDeg(orientation.headingDeg);
    });
  }

  const handleCompassMouseDown = (event: MouseEvent) => {
    if (
      methods.compassDisabled ||
      !methods.setCompassBearingPitch ||
      !showCompass
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearPendingCompassClick();
    clearCompassDrag();
    didCompassDrag = false;

    methods.beginCompassDrag?.();

    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const startOrientation = latestCompassOrientation;
    const maxCompassPitchDeg =
      methods.maxCompassPitchDeg ?? DEFAULT_MAX_COMPASS_PITCH_DEG;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (
        Math.abs(moveEvent.clientX - startMouseX) > COMPASS_DRAG_THRESHOLD_PX ||
        Math.abs(moveEvent.clientY - startMouseY) > COMPASS_DRAG_THRESHOLD_PX
      ) {
        didCompassDrag = true;
      }

      methods.setCompassBearingPitch?.({
        headingDeg:
          startOrientation.headingDeg +
          (moveEvent.clientX - startMouseX) * COMPASS_DRAG_FACTOR_DEG_PER_PX,
        pitchDeg: Math.min(
          Math.max(
            startOrientation.pitchDeg -
              (moveEvent.clientY - startMouseY) *
                COMPASS_DRAG_FACTOR_DEG_PER_PX,
            0
          ),
          maxCompassPitchDeg
        ),
      });
    };

    const handleMouseUp = () => {
      methods.endCompassDrag?.();
      clearCompassDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    clearCompassDrag = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      clearCompassDrag = () => {};
    };
  };

  const handleCompassClick = (event: MouseEvent) => {
    if (methods.compassDisabled || !showCompass) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (didCompassDrag) {
      didCompassDrag = false;
      return;
    }

    clearPendingCompassClick();
    pendingCompassClickTimeoutId = window.setTimeout(() => {
      methods.alignNorth?.();
      pendingCompassClickTimeoutId = null;
    }, COMPASS_CLICK_DELAY_MS);
  };

  const handleCompassDoubleClick = (event: MouseEvent) => {
    if (methods.compassDisabled || !showCompass) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    didCompassDrag = false;
    clearPendingCompassClick();
    methods.alignNorthNadir?.();
  };

  const cleanupDomControls = mountSceneNavigationControls(host, {
    disabled,
    style,
    home: {
      tooltip: resolvedMessages.homeTooltip,
      title: resolvedMessages.homeTitle,
      dataTestId: `${controlId}-home-control`,
      onClick: () => {
        runNavigationAction(methods, {
          type: NAVIGATION_ACTIONS.GO_HOME,
          options: homeOptions,
        });
      },
    },
    orbit:
      showOrbitControl && methods.canOrbit
        ? {
            tooltip: resolvedMessages.orbitTooltip,
            title: resolvedMessages.orbitTitle,
            dataTestId: `${controlId}-orbit-control`,
            content: orbitContent,
            onClick: () => {
              runNavigationAction(methods, {
                type: NAVIGATION_ACTIONS.ORBIT,
                options: resolvedOrbitOptions,
              });
            },
          }
        : null,
    zoomIn: {
      tooltip: resolvedMessages.zoomInTooltip,
      title: resolvedMessages.zoomInTitle,
      dataTestId: `${controlId}-zoom-in-control`,
      onClick: () => {
        runNavigationAction(methods, {
          type: NAVIGATION_ACTIONS.ZOOM_IN,
          options: zoomInOptions,
        });
      },
    },
    zoomOut: {
      tooltip: resolvedMessages.zoomOutTooltip,
      title: resolvedMessages.zoomOutTitle,
      dataTestId: `${controlId}-zoom-out-control`,
      onClick: () => {
        runNavigationAction(methods, {
          type: NAVIGATION_ACTIONS.ZOOM_OUT,
          options: zoomOutOptions,
        });
      },
    },
    secondaryZoom: secondaryZoomGroup
      ? {
          zoomIn: {
            disabled: secondaryZoomGroup.zoomInDisabled,
            tooltip:
              secondaryZoomGroup.zoomInTooltip ?? "Zoom in via camera FOV",
            title: resolvedMessages.zoomInTitle,
            dataTestId: `${controlId}-secondary-zoom-in-control`,
            content:
              secondaryZoomGroup.zoomInContent ??
              createFovZoomIconElement("in"),
            onClick: () => {
              runNavigationAction(methods, {
                type: NAVIGATION_ACTIONS.ZOOM_IN,
                options: secondaryZoomGroup.zoomInOptions,
              });
            },
          },
          zoomOut: {
            disabled: secondaryZoomGroup.zoomOutDisabled,
            tooltip:
              secondaryZoomGroup.zoomOutTooltip ?? "Zoom out via camera FOV",
            title: resolvedMessages.zoomOutTitle,
            dataTestId: `${controlId}-secondary-zoom-out-control`,
            content:
              secondaryZoomGroup.zoomOutContent ??
              createFovZoomIconElement("out"),
            onClick: () => {
              runNavigationAction(methods, {
                type: NAVIGATION_ACTIONS.ZOOM_OUT,
                options: secondaryZoomGroup.zoomOutOptions,
              });
            },
          },
        }
      : null,
    tertiaryZoom: tertiaryZoomGroup
      ? {
          zoomIn: {
            disabled: tertiaryZoomGroup.zoomInDisabled,
            tooltip:
              tertiaryZoomGroup.zoomInTooltip ?? "Zoom in via dolly zoom",
            title: resolvedMessages.zoomInTitle,
            dataTestId: `${controlId}-tertiary-zoom-in-control`,
            content:
              tertiaryZoomGroup.zoomInContent ??
              createCameraZoomIconElement("in"),
            onClick: () => {
              runNavigationAction(methods, {
                type: NAVIGATION_ACTIONS.ZOOM_IN,
                options: tertiaryZoomGroup.zoomInOptions,
              });
            },
          },
          zoomOut: {
            disabled: tertiaryZoomGroup.zoomOutDisabled,
            tooltip:
              tertiaryZoomGroup.zoomOutTooltip ?? "Zoom out via dolly zoom",
            title: resolvedMessages.zoomOutTitle,
            dataTestId: `${controlId}-tertiary-zoom-out-control`,
            content:
              tertiaryZoomGroup.zoomOutContent ??
              createCameraZoomIconElement("out"),
            onClick: () => {
              runNavigationAction(methods, {
                type: NAVIGATION_ACTIONS.ZOOM_OUT,
                options: tertiaryZoomGroup.zoomOutOptions,
              });
            },
          },
        }
      : null,
    compass: showCompass
      ? {
          tooltip: methods.compassDisabled
            ? resolvedMessages.compassDisabledTooltip
            : resolvedMessages.compassTooltip,
          title: resolvedMessages.compassTitle,
          dataTestId: `${controlId}-compass-control`,
          disabled: methods.compassDisabled,
          cursor: methods.compassCursor,
          onMouseDown: handleCompassMouseDown,
          onClick: handleCompassClick,
          onDoubleClick: handleCompassDoubleClick,
          content: compassContent,
        }
      : null,
  });

  return () => {
    clearPendingCompassClick();
    methods.endCompassDrag?.();
    clearCompassDrag();
    stopNeedleSync();
    stopOrbitSync();
    cleanupDomControls();
    destroyNeedle();
    destroyOrbitIcon();
    methods.destroy?.();
  };
};
