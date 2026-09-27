import { replace, type RouteObject } from "react-router-dom";

export const baseRouteFallback: RouteObject = {
  path: "*",
  loader: ({ request }) => replace(`/${new URL(request.url).search}`),
};
