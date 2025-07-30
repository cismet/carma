import React, { useState, useEffect } from "react";

export const ViewportDebugDisplay: React.FC = () => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Poll DOM directly on every render
  const props: Record<string, number | undefined> = {};

  // Window properties - direct access
  const windowProps = [
    "innerHeight",
    "innerWidth",
    "outerHeight",
    "outerWidth",
    "scrollX",
    "scrollY",
    "pageXOffset",
    "pageYOffset",
    "screenX",
    "screenY",
    "screenTop",
    "screenLeft",
  ];
  windowProps.forEach((prop) => {
    props[`window.${prop}`] = (window as unknown)[prop];
  });

  // Visual viewport properties - direct access
  if (window.visualViewport) {
    const visualViewportProps = [
      "height",
      "width",
      "offsetTop",
      "offsetLeft",
      "pageTop",
      "pageLeft",
      "scale",
    ];
    visualViewportProps.forEach((prop) => {
      props[`visualViewport.${prop}`] = (window.visualViewport as unknown)[
        prop
      ];
    });
  }

  // Document properties - direct access
  const documentProps = [
    "scrollTop",
    "scrollLeft",
    "clientHeight",
    "clientWidth",
    "offsetTop",
    "offsetLeft",
    "offsetHeight",
    "offsetWidth",
    "scrollHeight",
    "scrollWidth",
  ];
  documentProps.forEach((prop) => {
    props[`document.documentElement.${prop}`] = (
      document.documentElement as unknown
    )[prop];
    props[`document.body.${prop}`] = (document.body as unknown)[prop];
  });

  // Screen properties - direct access
  const screenProps = [
    "height",
    "width",
    "availHeight",
    "availWidth",
    "availTop",
    "availLeft",
  ];
  screenProps.forEach((prop) => {
    props[`screen.${prop}`] = (screen as unknown)[prop];
  });

  // Group properties by parent object and sort body/documentElement
  const groupedProps = Object.entries(props).reduce((acc, [key, value]) => {
    const parent = key.split(".")[0];
    if (!acc[parent]) acc[parent] = [];
    acc[parent].push([key, value]);
    return acc;
  }, {} as Record<string, Array<[string, number | undefined]>>);

  // Sort entries within document group to show body first, then documentElement
  if (groupedProps.document) {
    groupedProps.document.sort(([a], [b]) => {
      if (a.includes("body") && b.includes("documentElement")) return -1;
      if (a.includes("documentElement") && b.includes("body")) return 1;
      return 0;
    });
  }

  return (
    <div className="bg-black text-white text-xs p-1 font-mono">
      <div className="flex gap-2">
        {Object.entries(groupedProps).map(([parent, entries]) => (
          <div key={parent}>
            <div className="font-bold">{parent}</div>
            {entries.map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span>{key.split(".").slice(1).join(".")}:</span>
                <span>{value ?? "undefined"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
