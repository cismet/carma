import { createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { baseRouteFallback } from "./base-route-fallback";

describe("unknown route fallback", () => {
  it.each(["/pm-view", "/unknown/nested/path"])(
    "replaces %s with the base route and preserves map parameters",
    async (pathname) => {
      const router = createMemoryRouter(
        [{ path: "/" }, { path: "/pm-show" }, baseRouteFallback],
        { initialEntries: ["/pm-show"] }
      );
      try {
        await router.navigate(`${pathname}?lat=51.25&lng=7.12&zoom=16`);
        expect(router.state.location.pathname).toBe("/");
        expect(router.state.location.search).toBe("?lat=51.25&lng=7.12&zoom=16");
        expect(router.state.historyAction).toBe("REPLACE");
        expect(router.state.errors).toBeNull();
      } finally {
        router.dispose();
      }
    }
  );

  it("does not redirect a registered route", async () => {
    const router = createMemoryRouter([
      { path: "/" },
      { path: "/pm-show" },
      baseRouteFallback,
    ]);
    try {
      await router.navigate("/pm-show?zoom=16");
      expect(router.state.location.pathname).toBe("/pm-show");
      expect(router.state.errors).toBeNull();
    } finally {
      router.dispose();
    }
  });
});
