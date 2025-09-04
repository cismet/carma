import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";

export type SandboxedEval = (code: string) => any;

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

export async function sandboxedEvalExternal(code: string) {
  return currentSandboxedEvalImpl(code);
}

export function SandboxedEvalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: This is intentionally unsafe for step 1. We'll harden this in next steps.
  const sandboxedEval = useCallback<SandboxedEval>((code: string) => {
    // eslint-disable-next-line no-eval
    return eval(code);
  }, []);

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
