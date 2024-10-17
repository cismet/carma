import React, { ReactNode, useRef, useState, useEffect } from "react";
import Control, { ControlProps } from "./components/Control";
import styles from "./map-control.module.css";
import Main from "./components/Main";

export interface ControlLayoutProps {
  children: ReactNode;
  onResponsiveCollapse?: (e: unknown) => void;
  onHeightResize?: (set: number | null) => void;
  debugMode?: boolean;
  ifStorybook?: boolean;
}

export interface AllPositions {
  topleft?: ControlProps[];
  topright?: ControlProps[];
  bottomleft?: ControlProps[];
  bottomright?: ControlProps[];
}

const buildLayoutControlsChildren = (children: ReactNode) => {
  let mainComponent: React.ReactElement | null = null;
  let bottomLeftBiggestWidth = 300;
  let bottomRightBiggestWidth = 300;
  const allPositions: AllPositions = {};

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Control) {
        const {
          position,
          order = 0,
          fullCollapseWidth,
          bottomLeftWidth,
          bottomRightWidth,
        } = child.props as ControlProps;
        if (!allPositions[position]) {
          allPositions[position] = [];
        }
        allPositions[position]?.push({
          ...child.props,
          order,
          fullCollapseWidth,
        });
        if (bottomLeftWidth) {
          bottomLeftBiggestWidth =
            bottomLeftWidth > bottomLeftBiggestWidth
              ? bottomLeftWidth
              : bottomLeftBiggestWidth;
        }
        if (bottomRightWidth) {
          bottomRightBiggestWidth =
            bottomRightWidth > bottomRightBiggestWidth
              ? bottomRightWidth
              : bottomRightBiggestWidth;
        }
        allPositions[position].sort((a, b) => {
          const orderA = a.order;
          const orderB = b.order;
          if (orderA < orderB) {
            return -1;
          }
          if (orderA > orderB) {
            return 1;
          }

          return 0;
        });
        // .reverse();
      } else if (child.type === Main) {
        mainComponent = React.cloneElement(child);
      }
    }
  });

  return {
    mainComponent,
    allPositions,
    bottomLeftBiggestWidth,
    bottomRightBiggestWidth,
  };
};

const buildChildHiegthWithBottomShift = (childNodes, className, gap) => {
  let bottomShift = 0;
  childNodes.forEach((currentItem) => {
    if (currentItem.className.startsWith(className)) {
      if (bottomShift > 0) {
        currentItem.style.bottom = bottomShift + "px";
      }

      bottomShift += currentItem.clientHeight + gap;
    }
  });
};

const ControlLayout: React.FC<ControlLayoutProps> = ({
  children,
  onResponsiveCollapse = () => console.log(),
  debugMode = false,
  onHeightResize = (set: number | null) => set,
  ifStorybook = true,
}) => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);
  const [screenSizeWatcher, setScreenSizeWatcher] = useState("");
  const {
    allPositions,
    mainComponent,
    bottomLeftBiggestWidth,
    bottomRightBiggestWidth,
  } = buildLayoutControlsChildren(children);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomGap = 26;

  const bottomCollapsBrake =
    bottomLeftBiggestWidth + bottomGap + bottomRightBiggestWidth;

  const layoutWidth = containerRef.current?.clientWidth;

  const handleResize = () => {
    setWindowWidth(window.innerWidth);
    setLayoutHeight(ifStorybook ? window.innerHeight - 28 : window.innerHeight);
  };
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      // if (!mainComponent) {
      //   throw new Error('ControlLayout requires a Main component as a child.');
      // }

      const containerWidth = containerRef.current?.clientWidth;

      if (
        containerWidth &&
        containerWidth < bottomCollapsBrake &&
        screenSizeWatcher !== "mobile"
      ) {
        setScreenSizeWatcher("mobile");
        console.info("HOOK [MAPCONTROL] callback mobile");
        onResponsiveCollapse("mobile");
      } else if (
        containerWidth &&
        containerWidth > bottomCollapsBrake &&
        screenSizeWatcher !== "screen"
      ) {
        setScreenSizeWatcher("screen");
        console.info("HOOK [MAPCONTROL] callback screen");
        onResponsiveCollapse("screen");
      }

      const childNodes = containerRef.current.childNodes;

      buildChildHiegthWithBottomShift(childNodes, "_bottomright", 10);

      buildChildHiegthWithBottomShift(childNodes, "_bottomleft", 10);
    }
  }, [containerRef, windowWidth, screenSizeWatcher]);

  useEffect(() => {
    onHeightResize(layoutHeight);
  }, [layoutHeight]);

  return (
    <div
      className={`${styles["container"]} ${
        debugMode ? styles["debug-mode"] : ""
      }`}
      style={{
        height: "100%", //layoutHeight ? `${layoutHeight}px` : "calc(100vh - 54px)",
      }}
    >
      <div
        className={`${styles["controls-container"]} ${
          layoutWidth && layoutWidth <= bottomCollapsBrake
            ? styles["controls-container__mobile"]
            : ""
        }`}
        ref={containerRef}
      >
        {mainComponent ? mainComponent : null}
        {Object.entries(allPositions).map(([position, components]) => {
          if (position.startsWith("bottom")) {
            return components.map((component, idx) => (
              <div
                key={`${position}_${idx}`}
                className={`${styles[position]} ${
                  debugMode ? styles["debug-mode"] : ""
                } ${
                  component.fullCollapseWidth &&
                  layoutWidth &&
                  layoutWidth <= bottomCollapsBrake
                    ? styles["full-collapse-width"]
                    : ""
                } ${
                  layoutWidth && layoutWidth <= bottomCollapsBrake
                    ? styles[`${position}__mobile`]
                    : ""
                } ${
                  idx === 0 && layoutWidth && layoutWidth <= bottomCollapsBrake
                    ? styles[`${position}__first`]
                    : ""
                }`}
              >
                <Control {...component} key={`control_${position}_${idx}`} />
              </div>
            ));
          } else {
            return (
              <div
                key={position}
                className={`${styles[position]} ${
                  debugMode ? styles["debug-mode"] : ""
                }`}
              >
                {allPositions[position].map((component, idx) => {
                  return <Control {...component} key={idx} />;
                })}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};

export default ControlLayout;
