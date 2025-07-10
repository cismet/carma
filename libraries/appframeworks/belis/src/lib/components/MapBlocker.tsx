import { Button } from "antd";
import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";

interface MapBlockerProps {
  blocking: boolean;
  visible: boolean;
  width: number;
  height: number;
  setDone: (dine: boolean) => void;
}

export const MapBlocker = ({
  blocking,
  visible,
  width,
  height,
  setDone,
}: MapBlockerProps) => {
  const [slowRequest, setSlowRequest] = useState(false);

  useEffect(() => {
    setSlowRequest(false);
    const timer = setTimeout(() => {
      setSlowRequest(true);
    }, 10000);
    return () => {
      clearTimeout(timer);
    };
  }, [setSlowRequest, blocking]);

  if (blocking === true) {
    return (
      <div
        style={{
          position: "absolute",
          height: height,
          width: width,
          background: visible === true ? "#00000050" : "#00000000",
          //   backgroundColor: "#AD310B !important",
          //   backgroundImage: "none !important",
          WebkitTransition: "background-color 1000ms linear",
          MozTransition: "background-color 1000ms linear",
          OTransition: "background-color 1000ms linear",
          transition: "background-color 1000ms linear",
          WebkitAnimationDirection: "alternate",
          animationDirection: "alternate",
          WebkitAnimationIterationCount: "2",
          animationIterationCount: "2",

          left: 0,
          top: 0,
          zIndex: 100000,
          cursor: "wait",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {slowRequest === true && (
          <div>
            {/* <Icon
              style={{
                fontSize: size,
                color: "#ffffff",
                cursor: "pointer",
                textAlign: "center",
                opacity: 0.3,
                webkitAnimation: "fa-spin 4s infinite linear",
                animation: "fa-spin  4s infinite linear",
              }}
              spin
              icon={faSpinner}
            /> */}

            <div
              style={{
                margin: "50px",
                marginTop: "10px",
                padding: "10px",
                textAlign: "left",

                backgroundColor: "#ffffffbb",
                borderColor: "#00000070",
                borderStyle: "solid",
                borderRadius: "10px",
              }}
            >
              <p>
                <b>Die Anfrage dauert ungewöhnlich lange.</b>
              </p>
              <p>
                Bitte warten Sie einen Moment oder brechen Sie die Anfrage mit{" "}
                <Button
                  style={{ opacity: 0.8 }}
                  size="small"
                  danger
                  ghost
                  onClick={() => {
                    setDone(true);
                  }}
                >
                  Abbrechen
                </Button>{" "}
                ab.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    return <div />;
  }
};
