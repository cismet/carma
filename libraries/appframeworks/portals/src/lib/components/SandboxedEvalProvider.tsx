import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

// sandboxedEval evaluates "code" with an optional payload and resolves with the result.
export type SandboxedEval = (
  code: string,
  payload?: unknown
) => Promise<unknown>;

type SandboxedEvalContextType = {
  sandboxedEval: SandboxedEval;
};

const SandboxedEvalContext = createContext<
  SandboxedEvalContextType | undefined
>(undefined);

// Module-level impl to allow non-React code to use sandboxedEval safely.
// Start with a throwing default so usage before provider mount fails fast.
const notInitialized: SandboxedEval = () => {
  throw new Error(
    "SandboxedEval is not initialized. Wrap your app with <SandboxedEvalProvider> before calling sandboxedEvalExternal()."
  );
};

let currentSandboxedEvalImpl: SandboxedEval = notInitialized;

function setSandboxedEvalImpl(fn: SandboxedEval) {
  currentSandboxedEvalImpl = fn;
}

export async function sandboxedEvalExternal(code: string, payload?: unknown) {
  return currentSandboxedEvalImpl(code, payload);
}

export function SandboxedEvalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Iframe sandbox setup
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (value: unknown) => void;
        reject: (reason?: unknown) => void;
        timeoutId: number;
      }
    >()
  );
  const requestCounterRef = useRef(0);

  // Create hidden iframe with strict sandboxing
  useEffect(() => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts");
    // Minimal runtime to evaluate code and post back results
    const srcdoc = `<!doctype html><html><head><meta charset=\"utf-8\" /></head><body>
<script>
(function(){
  // In srcdoc sandbox, origin is 'null'. Communicate via postMessage.
  function respond(target, msg){
    try { target.postMessage(msg, '*'); } catch(e) {}
  }
  async function runEval(code, payload){
    // eslint-disable-next-line no-eval
    const evaluated = eval(code);
    if (typeof evaluated === 'function') {
      return await evaluated(payload);
    }
    return evaluated;
  }
  window.addEventListener('message', async function(event){
    try {
      var data = event && event.data;
      if (!data || data.type !== 'EVAL' || !data.id) { return; }
      var result;
      try {
        result = await runEval(data.code, data.payload);
        respond(window.parent, { type: 'RESULT', id: data.id, value: result });
      } catch (err) {
        respond(window.parent, { type: 'ERROR', id: data.id, error: { message: (err && err.message) || String(err), name: err && err.name, stack: err && err.stack } });
      }
    } catch (e) {
      // ignore
    }
  });
})();
<\/script>
</body></html>`;
    iframe.srcdoc = srcdoc;
    document.body.appendChild(iframe);
    iframeRef.current = iframe;

    const onMessage = (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) return;
      const data = event.data as
        | { type: "RESULT"; id: string; value: unknown }
        | {
            type: "ERROR";
            id: string;
            error?:
              | { message?: string; name?: string; stack?: string }
              | unknown;
          };
      if (!data || (data.type !== "RESULT" && data.type !== "ERROR")) return;
      const pending = pendingRef.current.get(data.id);
      if (!pending) return;
      pendingRef.current.delete(data.id);
      window.clearTimeout(pending.timeoutId);
      if (data.type === "RESULT") {
        pending.resolve(data.value);
      } else {
        const rawErr = (data as { type: "ERROR"; id: string; error?: unknown })
          .error;
        let errName: string | undefined;
        let errStack: string | undefined;
        let errMessage = "Sandbox error";
        if (rawErr && typeof rawErr === "object") {
          const e = rawErr as {
            message?: string;
            name?: string;
            stack?: string;
          };
          errMessage = e.message ?? errMessage;
          errName = e.name;
          errStack = e.stack;
        }
        const err = new Error(errMessage);
        if (errName) (err as unknown as { name?: string }).name = errName;
        if (errStack) (err as unknown as { stack?: string }).stack = errStack;
        pending.reject(err);
      }
    };

    window.addEventListener("message", onMessage);

    // Capture the current map reference for stable cleanup
    const pendingMap = pendingRef.current;

    return () => {
      window.removeEventListener("message", onMessage);
      // Reject any pending
      for (const [, p] of pendingMap.entries()) {
        window.clearTimeout(p.timeoutId);
        p.reject(new Error("Sandboxed eval aborted (provider unmounted)"));
      }
      pendingMap.clear();
      // Remove iframe
      try {
        iframeRef.current?.remove();
      } catch {}
      iframeRef.current = null;
    };
  }, []);

  const postEval = useCallback(
    (code: string, payload?: unknown, timeoutMs: number = 5000) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin) {
        throw new Error(
          "SandboxedEval iframe is not initialized. Ensure provider is mounted."
        );
      }
      const id = `req_${Date.now()}_${requestCounterRef.current++}`;
      return new Promise<unknown>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error("Sandboxed eval timed out"));
        }, timeoutMs);
        pendingRef.current.set(id, { resolve, reject, timeoutId });
        iframeWin.postMessage({ type: "EVAL", id, code, payload }, "*");
      });
    },
    []
  );

  const sandboxedEval = useCallback<SandboxedEval>(
    (code: string, payload?: unknown) => {
      return postEval(code, payload);
    },
    [postEval]
  );

  // Make the impl available outside React via module-level setter
  useEffect(() => {
    setSandboxedEvalImpl(sandboxedEval);
  }, [sandboxedEval]);

  return (
    <SandboxedEvalContext.Provider value={{ sandboxedEval }}>
      {children}
    </SandboxedEvalContext.Provider>
  );
}

export function useSandboxedEval(): SandboxedEval {
  const ctx = useContext(SandboxedEvalContext);
  if (!ctx) {
    throw new Error(
      "useSandboxedEval must be used within a SandboxedEvalProvider"
    );
  }
  return ctx.sandboxedEval;
}
