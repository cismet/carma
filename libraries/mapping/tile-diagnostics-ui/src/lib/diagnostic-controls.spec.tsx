// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiagnosticChoice,
  DiagnosticSection,
  DiagnosticWindowActions,
  DIAGNOSTIC_BOOLEAN_CHOICES,
} from "./DiagnosticControls";

afterEach(cleanup);

describe("diagnostic controls", () => {
  it("shares dock/close actions without swallowing a panel's header controls", () => {
    const onToggleExternal = vi.fn();
    const onClose = vi.fn();
    const onFollow = vi.fn();
    const view = (external: boolean) => (
      <DiagnosticWindowActions
        label="Overview"
        external={external}
        onToggleExternal={onToggleExternal}
        onClose={onClose}
      >
        <button aria-pressed onClick={onFollow}>
          Follow viewport
        </button>
      </DiagnosticWindowActions>
    );
    const { rerender } = render(view(false));
    fireEvent.click(screen.getByRole("button", { name: "Follow viewport" }));
    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(onToggleExternal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undock Overview" }));
    expect(onToggleExternal).toHaveBeenCalledTimes(1);
    rerender(view(true));
    fireEvent.click(screen.getByRole("button", { name: "Dock Overview" }));
    expect(onToggleExternal).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Close Overview" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("keeps the legend collapsed across content updates", () => {
    const { container, rerender } = render(
      <DiagnosticSection title="Symbol legend">First</DiagnosticSection>
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(true);
    details.open = false;
    fireEvent(details, new Event("toggle"));
    rerender(<DiagnosticSection title="Symbol legend">Next</DiagnosticSection>);
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Next");
  });

  it("uses radios without dropdowns and preserves boolean values", () => {
    const onChange = vi.fn();
    render(
      <DiagnosticChoice
        label="Wireframe"
        value={true}
        choices={DIAGNOSTIC_BOOLEAN_CHOICES}
        onChange={onChange}
      />
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      (screen.getByRole("radio", { name: "On" }) as HTMLInputElement).checked
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("preserves string choices", () => {
    const onChange = vi.fn();
    render(
      <DiagnosticChoice
        label="View"
        value="extent"
        choices={[
          { value: "extent", label: "Extent" },
          { value: "frustum", label: "Follow viewport" },
        ]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "Follow viewport" }));
    expect(onChange).toHaveBeenCalledWith("frustum");
  });
});
