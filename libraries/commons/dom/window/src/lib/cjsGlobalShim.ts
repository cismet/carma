// https://github.com/frontend-collective/react-image-lightbox/issues/634
// provides compatibility for react-cismap dependency react-image-lightbox

export const cjsGlobalShim = () => {
  if (typeof global === "undefined") {
    (window as unknown as { global: Window }).global = window;
  }
};
