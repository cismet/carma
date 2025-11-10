import {
  type ErrorBoundaryProps,
  useErrorBoundary,
  withErrorBoundary,
} from "react-error-boundary";
import { useState, useEffect, useMemo } from "react";
import { CesiumWidget } from "cesium";
import { useCesiumContextOptional } from "./hooks/useCesiumContext";
import {
  useCesiumDevConsoleTrigger,
  type CesiumDevConsoleTriggerOptions,
} from "./hooks/useCesiumDevConsoleTrigger";
import {
  useReloadOnCesiumRenderError,
  type ReloadOnCesiumRenderErrorOptions,
} from "./hooks/useReloadOnCesiumRenderError";
import { getCesiumVersion, checkWindowEnv } from "./utils/cesiumEnv";

export type ForwardedCesiumError = Error & {
  cesiumTitle?: string;
  cesiumMessage?: string;
  // snapshot of useful state at forward-time
  forwarderAt?: string;
  forwarderStack?: string;
  carmaCesiumContext?: Record<string, unknown>;
  originalStack?: string;
};

export type CesiumErrorHandlerOptions = {
  devConsoleTrigger?: boolean | CesiumDevConsoleTriggerOptions;
  reloadOnRenderError?: boolean | ReloadOnCesiumRenderErrorOptions;
};

const overrideCesiumWidgetShowErrorPanel = (
  setCesiumError: React.Dispatch<
    React.SetStateAction<ForwardedCesiumError | null>
  >,
  debugOnError: boolean
): void => {
  CesiumWidget.prototype.showErrorPanel = function (
    title: string,
    message: string,
    error: unknown
  ) {
    console.debug("[Cesium] showErrorPanel invoked");
    if (debugOnError) {
      // dev only: pause on any natural Cesium error when feature flag + local dev are active
      debugger; // eslint-disable-line no-debugger
    }
    // Normalize any input (string/object) to a real Error instance
    const base: Error =
      error instanceof Error
        ? error
        : typeof error === "string"
        ? new Error(error)
        : new Error("Cesium error (non-Error thrown)");

    const forwarded = base as ForwardedCesiumError;
    forwarded.cesiumTitle = title;
    forwarded.cesiumMessage = message;
    forwarded.originalStack = base.stack;
    // capture the forwarder stack to aid root-cause tracing
    forwarded.forwarderStack = new Error(
      "Forwarded from CesiumWidget.showErrorPanel"
    ).stack;
    setCesiumError(forwarded);
  };
};

const deriveDevConsoleOptions = (
  input: CesiumErrorHandlerOptions["devConsoleTrigger"]
): CesiumDevConsoleTriggerOptions | undefined =>
  typeof input === "object" ? input : { isDeveloperMode: input === true };

const detectIsDev = (): boolean => {
  try {
    return Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV);
  } catch {
    return false;
  }
};

const deriveReloadOptions = (
  isDev: boolean,
  input: CesiumErrorHandlerOptions["reloadOnRenderError"]
): ReloadOnCesiumRenderErrorOptions | undefined => {
  if (typeof input === "object") {
    console.debug(
      "[Cesium] reloadOnRenderError options derived from object input",
      {
        input,
        isDev,
      }
    );
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : !isDev,
      eventName: input.eventName,
      onReloadRequested: input.onReloadRequested,
    };
  }
  return {
    enabled: input === undefined ? true : input === true,
  };
};

export const CesiumErrorHandler = withErrorBoundary(
  function CesiumErrorHandler(props: CesiumErrorHandlerOptions) {
    const [cesiumError, setCesiumError] = useState<ForwardedCesiumError | null>(
      null
    );

    const { showBoundary } = useErrorBoundary();
    const ctx = useCesiumContextOptional();

    // Memoize derived option objects for referential stability
    const isDev = useMemo(detectIsDev, []);
    const devOpts = useMemo(
      () => deriveDevConsoleOptions(props?.devConsoleTrigger),
      [props?.devConsoleTrigger]
    );
    const reloadOpts = useMemo(
      () => deriveReloadOptions(isDev, props?.reloadOnRenderError),
      [isDev, props?.reloadOnRenderError]
    );

    useCesiumDevConsoleTrigger(devOpts);
    //useReloadOnCesiumRenderError(reloadOpts);

    useEffect(() => {
      console.debug(
        "overriding CesiumWidget.showErrorPanel with custom Error forwarder"
      );
      const debugOnError = isDev && devOpts?.isDeveloperMode === true;
      overrideCesiumWidgetShowErrorPanel(setCesiumError, debugOnError);
    }, [showBoundary, isDev, devOpts?.isDeveloperMode]);

    useEffect(() => {
      if (cesiumError && showBoundary) {
        cesiumError.forwarderAt = new Date().toISOString();
        // Respect global suppression flag to avoid crashing the viewer
        const suppressed = window.CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY;
        if (suppressed) {
          // Enrich logs with Cesium version and worker base URL
          const baseUrl: string | undefined = checkWindowEnv().cesiumBaseUrl;
          const meta = {
            cesiumVersion: getCesiumVersion(),
            baseUrl,
            workersBaseUrl: baseUrl ? `${baseUrl}/Workers` : undefined,
          };
          console.warn(
            "[Cesium] error forwarded (suppressed)",
            cesiumError,
            meta
          );
          // Emit the same app-level event as renderError handling for unified reactions (e.g., reload)
          try {
            window.dispatchEvent(
              new CustomEvent("carma:cesium:renderError", {
                detail: { error: cesiumError, meta },
              })
            );
          } catch {}
          // clear suppression for next error
          window.CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = false;
        } else {
          showBoundary(cesiumError);
        }
        setCesiumError(null);
      }
    }, [cesiumError, showBoundary, ctx]);

    return null;
  },
  {
    // render component intentionally missing to not override external ErrorBoundary
    // withErrorBoundary is used to allow use of this component outside of ErrorBoundary contexts without causing errors because of the missing context
    onError: (error, info) => {
      console.error(
        "Consider using ErrorBoundary to manage Cesium errors with app context",
        error,
        info
      );
    },
  } as ErrorBoundaryProps
);

export default CesiumErrorHandler;
