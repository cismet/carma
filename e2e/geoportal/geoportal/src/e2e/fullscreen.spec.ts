import { test, expect } from "@playwright/test";

test.describe("fullscreen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens app in full page when toggled", async ({ page }) => {
    const map = page.locator("#routedMap");
    const control = page.locator('[data-test-id="full-screen-control"]');

    await expect(map).toBeVisible();
    await expect(control).toBeVisible();

    const size = () =>
      map.evaluate(
        (el) => [el.clientWidth, el.clientHeight] as [number, number]
      );

    const [w0, h0] = await size();

    // enter fullscreen
    await control.click();

    // wait until size differs from initial (matcher is attached to poll)
    await expect
      .poll(size, {
        timeout: 7000,
        message: "map size should change after entering fullscreen",
      })
      .not.toEqual([w0, h0]);

    // now read the new size if you need it later
    const [w1, h1] = await size();

    // exit fullscreen
    await control.click();

    // wait until size differs from the fullscreen size
    await expect
      .poll(size, {
        timeout: 7000,
        message: "map size should change after exiting fullscreen",
      })
      .not.toEqual([w1, h1]);

    // optional: final read
    const [w2, h2] = await size();
    // sanity checks (not required, but explicit)
    expect(w1).not.toBe(w0);
    expect(h1).not.toBe(h0);
    expect(w2).not.toBe(w1);
    expect(h2).not.toBe(h1);
  });
});
