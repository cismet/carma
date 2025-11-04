import { useRef, useEffect } from "react";

interface ChangedProps {
  [key: string]: {
    from: any;
    to: any;
  };
}

interface RenderInfo {
  renderCount: number;
  lastRenderTime: number;
  renderInterval: number;
  changedProps: ChangedProps;
  changedState: ChangedProps;
}

/**
 * Debug utility to track why a component re-rendered.
 * Logs changed props, state values, and render frequency.
 * 
 * IMPORTANT: This should NOT cause re-renders itself - it only reads refs
 * and logs during the render phase.
 * 
 * @param componentName - Name to identify the component in logs
 * @param props - Current props object to track
 * @param state - Optional state values to track (pass as object)
 * @param options - Configuration options
 * 
 * @example
 * ```tsx
 * function MyComponent({ isMode2d, height, width }) {
 *   const [count, setCount] = useState(0);
 *   
 *   useWhyDidYouRender("MyComponent", { isMode2d, height, width }, { count });
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useWhyDidYouRender(
  componentName: string,
  props: Record<string, any> = {},
  state: Record<string, any> = {},
  options: {
    enabled?: boolean;
    logOnMount?: boolean;
    includeRefs?: Record<string, React.RefObject<any>>;
  } = {}
): RenderInfo {
  const {
    enabled = true,
    logOnMount = false,
    includeRefs = {},
  } = options;

  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const prevPropsRef = useRef(props);
  const prevStateRef = useRef(state);
  const isMountRef = useRef(true);

  if (!enabled) {
    return {
      renderCount: 0,
      lastRenderTime: 0,
      renderInterval: 0,
      changedProps: {},
      changedState: {},
    };
  }

  // Calculate render info
  renderCountRef.current++;
  const now = Date.now();
  lastRenderIntervalRef.current = now - lastRenderTimeRef.current;
  lastRenderTimeRef.current = now;

  const changedProps: ChangedProps = {};
  const changedState: ChangedProps = {};

  // Check which props changed
  Object.keys(props).forEach((key) => {
    if (prevPropsRef.current[key] !== props[key]) {
      changedProps[key] = {
        from: prevPropsRef.current[key],
        to: props[key],
      };
    }
  });

  // Check which state values changed
  Object.keys(state).forEach((key) => {
    if (prevStateRef.current[key] !== state[key]) {
      changedState[key] = {
        from: prevStateRef.current[key],
        to: state[key],
      };
    }
  });

  // Check refs if provided
  const refInfo: Record<string, any> = {};
  Object.entries(includeRefs).forEach(([key, ref]) => {
    refInfo[key] = ref.current ? {
      exists: true,
      type: ref.current?.constructor?.name,
    } : { exists: false };
  });

  // Log changes
  const isMount = isMountRef.current;
  if (isMount && !logOnMount) {
    // Skip mount logging if disabled
  } else {
    const hasChanges = Object.keys(changedProps).length > 0 || Object.keys(changedState).length > 0;
    
    if (isMount || hasChanges) {
      const logData: any = {
        component: componentName,
        renderCount: renderCountRef.current,
        renderInterval: `${lastRenderIntervalRef.current}ms`,
        isMount,
      };

      if (Object.keys(changedProps).length > 0) {
        logData.changedProps = changedProps;
      }

      if (Object.keys(changedState).length > 0) {
        logData.changedState = changedState;
      }

      if (Object.keys(refInfo).length > 0) {
        logData.refs = refInfo;
      }

      console.debug(`[CESIUM] [DEBUG|RENDER] ${componentName}:`, logData);
    }
  }

  // Update refs after logging (use useEffect to avoid causing re-renders)
  useEffect(() => {
    prevPropsRef.current = props;
    prevStateRef.current = state;
    isMountRef.current = false;
  });

  return {
    renderCount: renderCountRef.current,
    lastRenderTime: lastRenderTimeRef.current,
    renderInterval: lastRenderIntervalRef.current,
    changedProps,
    changedState,
  };
}

/**
 * Simpler version that just logs on every render with minimal overhead.
 * Useful for quick debugging without tracking specific values.
 */
export function useRenderLog(componentName: string, enabled = true) {
  const renderCountRef = useRef(0);
  
  if (!enabled) return;
  
  renderCountRef.current++;
  console.debug(`[CESIUM] [DEBUG|RENDER] ${componentName} rendered #${renderCountRef.current}`);
}
