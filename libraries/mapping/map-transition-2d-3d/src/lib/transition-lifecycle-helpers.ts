import { type MutableRefObject } from "react";

// Type alias for lifecycle ref (kept for backward compatibility)
export type TransitionLifecycleRef = MutableRefObject<Record<string, never>>;
