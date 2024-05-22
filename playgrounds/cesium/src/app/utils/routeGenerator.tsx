import { Route } from 'react-router-dom';
import { RouteDescriptor } from '../routes';
import { Fragment } from 'react';

export function routeGenerator(routes: RouteDescriptor[]) {
  return routes.map(([path, , ComponentOrArray], index) =>
    Array.isArray(ComponentOrArray) ? (
      <Fragment key={index}>
        {ComponentOrArray.map(([childPath, , ChildComponent], i) => (
          <Route
            key={i}
            path={`${path}${childPath}`}
            element={<ChildComponent />}
          />
        ))}
      </Fragment>
    ) : (
      <Route key={index} path={path} element={<ComponentOrArray />} />
    )
  );
}
