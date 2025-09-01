import { useEffect, useRef, useState } from "react";
import { CSSProperties } from "react";
interface AttributionControlProps {
  styles?: CSSProperties;
}

export const useAttributionControlStyling = ({
  styles = {},
}: AttributionControlProps = {}) => {
  const [attributionHeight, setAttributionHeight] = useState(0);
  const hash = window.location.hash;
  const queryString = hash.split("?")[1];
  const bgParam = useRef(new URLSearchParams(queryString).get("bg"));
  const calculateBottomGab = (newBg: string | null) => {
    setTimeout(() => {
      const attributionControl = document.querySelector(
        ".leaflet-control-attribution"
      ) as HTMLElement | null;
      if (attributionControl) {
        Object.assign(attributionControl.style, styles);
        const height = attributionControl.getBoundingClientRect().height;
        setAttributionHeight(height);
      } else {
        setAttributionHeight(0);
      }
      if (newBg) {
        bgParam.current = newBg;
      }
    }, 100);
  };

  const buildBottomGap = () => {
    const hash = window.location.hash;
    const queryString = hash.split("?")[1];
    const searchParams = new URLSearchParams(queryString);
    const newBg = searchParams.get("bg");

    if (newBg !== bgParam.current) {
      calculateBottomGab(newBg);
    }
  };

  useEffect(() => {
    calculateBottomGab(null);
    window.addEventListener("popstate", buildBottomGap);

    const originalPushState = window.history.pushState;
    window.history.pushState = function (
      data: any,
      unused: string,
      url?: string | URL | null
    ) {
      const result = originalPushState.apply(this, [data, unused, url]);
      window.dispatchEvent(new Event("popstate"));
      return result;
    };

    return () => {
      window.removeEventListener("popstate", buildBottomGap);
      window.history.pushState = originalPushState;
    };
  }, []);

  return { attributionHeight };
};
