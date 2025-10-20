import type { Cartesian3, Scene } from "@carma/cesium";
import type { ReactNode } from "react";

/**
 * Rendering target for overlay visualizations
 */
export type OverlayRenderTarget = "dom" | "canvas" | "svg";

/**
 * Position in Cesium world space that should be tracked
 */
export interface CesiumPosition {
  cartesian3: Cartesian3;
  /** Optional identifier for this position */
  id?: string;
}

/**
 * Screen coordinates for a tracked position
 */
export interface ScreenPosition {
  x: number;
  y: number;
  /** Whether the position is visible on screen */
  visible: boolean;
  /** Whether the position is behind the camera */
  behindCamera: boolean;
}

/**
 * Visualization registration that maps Cesium objects to DOM/Canvas/SVG output
 */
export interface VisualizationRegistration<TInput = unknown, TOutput = unknown> {
  /** Unique identifier for this visualization */
  id: string;
  
  /** Render target type */
  target: OverlayRenderTarget;
  
  /** 
   * Extract Cesium positions from input data
   * Provider will automatically track these and provide screen coordinates
   */
  extractPositions: (input: TInput) => CesiumPosition[];
  
  /**
   * Render function that receives input data and screen positions
   * Returns DOM nodes, canvas draw commands, or SVG elements
   */
  render: (input: TInput, screenPositions: Map<string, ScreenPosition>) => TOutput;
  
  /** Optional cleanup function */
  cleanup?: () => void;
  
  /** Z-index for layering (higher = on top) */
  zIndex?: number;
}

/**
 * DOM-based visualization output
 */
export interface DOMVisualization {
  target: "dom";
  content: ReactNode;
}

/**
 * Canvas-based visualization output
 */
export interface CanvasVisualization {
  target: "canvas";
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * SVG-based visualization output
 */
export interface SVGVisualization {
  target: "svg";
  content: ReactNode;
}

/**
 * Union of all visualization output types
 */
export type VisualizationOutput =
  | DOMVisualization
  | CanvasVisualization
  | SVGVisualization;

/**
 * Context value provided by CesiumOverlayProvider
 */
export interface CesiumOverlayContextValue {
  /** Register a new visualization */
  registerVisualization: <TInput, TOutput>(
    registration: VisualizationRegistration<TInput, TOutput>
  ) => void;
  
  /** Unregister a visualization by ID */
  unregisterVisualization: (id: string) => void;
  
  /** Update input data for a visualization */
  updateVisualization: <TInput>(id: string, input: TInput) => void;
  
  /** Get screen position for a Cartesian3 coordinate */
  getScreenPosition: (cartesian3: Cartesian3) => ScreenPosition | null;
  
  /** Cesium scene reference */
  scene: Scene | null;
}
