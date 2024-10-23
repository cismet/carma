import { Route } from "react-router-dom";
import { RouteDescriptor } from "../routes";
import { Fragment, useEffect } from "react";
import { APP_DEFAULT_SHORT_TITLE, APP_DEFAULT_TITLE } from "../config";

const DocumentTitle: React.FC<{ title: string }> = ({ title }) => {
  useEffect(() => {
    document.title = `${APP_DEFAULT_SHORT_TITLE} ${title}`;
  }, [title]);

  return null;
};

export function routeGenerator(routes: RouteDescriptor[]) {
  return routes.map(([path, name, ComponentOrArray], index) =>
    Array.isArray(ComponentOrArray) ? (
      <Fragment key={index}>
        {ComponentOrArray.map(([childPath, name, ChildComponent], i) => (
          <Route
            key={i}
            path={`${path}${childPath}`}
            element={
              <>
                <DocumentTitle title={name} />
                <ChildComponent />
              </>
            }
          />
        ))}
      </Fragment>
    ) : (
      <Route
        key={index}
        path={path}
        element={
          <>
            <DocumentTitle title={name} />
            <ComponentOrArray />
          </>
        }
      />
    )
  );
}
