// @vitest-environment jsdom
import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddonProvider } from "@carma-mapping/contexts";
import { useAddonState } from "./AddonStateContext";

const ShadowReader = () => {
  const [state] = useAddonState("shadowSimulation");
  return <span>{state?.enabled ? "shadow on" : "shadow off"}</span>;
};
const DateReader = () => {
  const [date, setDate] = useAddonState("shadowDate");
  return (
    <button
      onClick={() =>
        setDate((previous) => ({
          ...previous!,
          minutes: previous!.minutes + 1,
        }))
      }
    >
      {date?.minutes}
    </button>
  );
};

describe("addon provider render isolation", () => {
  it("seeds the first render and does not commit unrelated readers on date changes", () => {
    const shadowCommits = vi.fn();
    const dateCommits = vi.fn();
    const { rerender, unmount } = render(
      <AddonProvider
        scopeKey="addons"
        initialState={{
          shadowSimulation: { enabled: true },
          shadowDate: { minutes: 660 },
        }}
      >
        <Profiler id="shadow" onRender={shadowCommits}>
          <ShadowReader />
        </Profiler>
        <Profiler id="date" onRender={dateCommits}>
          <DateReader />
        </Profiler>
      </AddonProvider>
    );
    expect(screen.getByText("shadow on")).toBeTruthy();
    act(() => screen.getByRole("button").click());
    expect(screen.getByText("661")).toBeTruthy();
    expect(shadowCommits).toHaveBeenCalledTimes(1);
    expect(dateCommits).toHaveBeenCalledTimes(2);
    rerender(
      <AddonProvider
        scopeKey="other"
        initialState={{ shadowSimulation: { enabled: false } }}
      >
        <ShadowReader />
      </AddonProvider>
    );
    expect(screen.getByText("shadow off")).toBeTruthy();
    unmount();
  });
});
