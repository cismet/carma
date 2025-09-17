import {
  type ErrorBoundaryProps,
  useErrorBoundary,
  withErrorBoundary,
} from "react-error-boundary";
import { useState, useEffect } from "react";
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
import { snapshotCesiumContext } from "./utils/cesiumContextSnapshot";
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

const overrideCesiumWidgetShowErrorPanel = function (
  setCesiumError: React.Dispatch<
    React.SetStateAction<ForwardedCesiumError | null>
  >
) {
  CesiumWidget.prototype.showErrorPanel = function (
    title: string,
    message: string,
    error: unknown
  ) {
    console.debug("[Cesium] showErrorPanel invoked");
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

export const CesiumErrorHandler = withErrorBoundary(
  function CesiumErrorHandler(props: CesiumErrorHandlerOptions) {
    const [cesiumError, setCesiumError] = useState<ForwardedCesiumError | null>(
      null
    );

    const { showBoundary } = useErrorBoundary();
    const ctx = useCesiumContextOptional();

    // Hook wiring (always call hooks; control behavior via options)
    const devOpts: CesiumDevConsoleTriggerOptions | undefined =
      typeof props?.devConsoleTrigger === "object"
        ? props.devConsoleTrigger
        : { isDeveloperMode: props?.devConsoleTrigger === true };
    useCesiumDevConsoleTrigger(devOpts);

    const isDev = (() => {
      try {
        // Vite-style import.meta.env.DEV; fall back to false if not present
        return Boolean(
          typeof import.meta !== "undefined" &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (import.meta as any)?.env?.DEV
        );
      } catch {
        return false;
      }
    })();
    const reloadOpts: ReloadOnCesiumRenderErrorOptions | undefined =
      typeof props?.reloadOnRenderError === "object"
        ? {
            enabled:
              typeof props.reloadOnRenderError.enabled === "boolean"
                ? props.reloadOnRenderError.enabled
                : !isDev,
            eventName: props.reloadOnRenderError.eventName,
            onReloadRequested: props.reloadOnRenderError.onReloadRequested,
          }
        : // default: enabled in prod, disabled in dev; allow explicit boolean override
          {
            enabled:
              props?.reloadOnRenderError === undefined
                ? !isDev
                : props.reloadOnRenderError === true,
          };
    useReloadOnCesiumRenderError(reloadOpts);

    useEffect(() => {
      console.debug(
        "overriding CesiumWidget.showErrorPanel with custom Error forwarder"
      );
      overrideCesiumWidgetShowErrorPanel(setCesiumError);
    }, [showBoundary]);

    useEffect(() => {
      if (cesiumError && showBoundary) {
        cesiumError.forwarderAt = new Date().toISOString();
        if (ctx) {
          cesiumError.carmaCesiumContext = snapshotCesiumContext(ctx);
        }
        // Respect global suppression flag to avoid crashing the viewer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const suppressed = (window as any).CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY;
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = false;
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
