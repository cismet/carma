export function detectWebGLContext(callback: (flag: boolean) => void) {
  console.debug("TESTING GPU");
  // adjusted from https://github.com/idofilin/webgl-by-example/blob/master/detect-webgl/detect-webgl.js
  // via https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL
  // Create canvas element. The canvas is not added to the document itself
  let canvas: HTMLCanvasElement | null = document.createElement("canvas");
  // Get WebGLRenderingContext from canvas element.
  let gl =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (gl && gl instanceof WebGLRenderingContext) {
    console.debug("GPU enabled.");
    callback(true);
  } else {
    console.info("Your browser or device may not support WebGL. GPU disabled.");
    callback(false);
  }
  // clean up
  canvas = null;
}
