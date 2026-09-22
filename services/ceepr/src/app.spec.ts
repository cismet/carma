import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";

import { setupApp } from "./app";

const TOKEN = "a-valid-edit-token-0123456789";
const FOLDER = "wuppertal/_dev_geoportal_pmshows";
/** where the geoportal share button stores (`useShareUrl.ts`) */
const SHARE_FOLDER = "wuppertal/_dev_geoportal";
const GEOPORTAL_ORIGIN = "http://localhost:4200";

let storageDir: string;
let server: Server;
let base: string;

const store = (body: unknown, token?: string) =>
  fetch(`${base}/store/${FOLDER}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Ceepr-Edit-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });

const replace = (key: string, body: unknown, token?: string) =>
  fetch(`${base}/store/${FOLDER}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Ceepr-Edit-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });

const read = async (key: string) =>
  (await fetch(`${base}/config/${FOLDER}/${key}`)).json();

const keyOf = async (response: Response): Promise<string> =>
  ((await response.json()) as { key: string }).key;

beforeAll(async () => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  process.env.ALLOWED_ORIGINS = GEOPORTAL_ORIGIN;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ceepr-spec-"));
  server = setupApp(storageDir).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(storageDir, { recursive: true, force: true });
});

describe("edit tokens", () => {
  it("replaces a configuration stored with a token, under the same key", async () => {
    const key = await keyOf(await store({ title: "first" }, TOKEN));

    const response = await replace(key, { title: "second" }, TOKEN);

    expect(response.status).toBe(200);
    expect(await read(key)).toEqual({ title: "second" });
  });

  it("keeps the token itself off the disk", async () => {
    const key = await keyOf(await store({ title: "first" }, TOKEN));

    const sidecar = fs.readFileSync(
      path.join(storageDir, FOLDER, `${key}.edit`),
      "utf-8"
    );

    expect(sidecar).not.toContain(TOKEN);
  });

  it("refuses a wrong token and leaves the configuration alone", async () => {
    const key = await keyOf(await store({ title: "first" }, TOKEN));

    const response = await replace(key, { title: "other" }, `${TOKEN}-wrong`);

    expect(response.status).toBe(403);
    expect(await read(key)).toEqual({ title: "first" });
  });

  it("refuses a replace without a token", async () => {
    const key = await keyOf(await store({ title: "first" }, TOKEN));

    expect((await replace(key, { title: "other" })).status).toBe(401);
  });

  it("never changes a configuration stored without a token", async () => {
    const key = await keyOf(await store({ title: "share link" }));

    const response = await replace(key, { title: "other" }, TOKEN);

    expect(response.status).toBe(403);
    expect(await read(key)).toEqual({ title: "share link" });
  });

  it("answers 404 for a key nobody stored", async () => {
    expect((await replace("0123456789abcdef", { a: 1 }, TOKEN)).status).toBe(
      404
    );
  });

  it("rejects an unusable token on store", async () => {
    expect((await store({ a: 1 }, "short")).status).toBe(400);
  });
});

// The geoportal share button and every reader of a share link, as they talk to
// ceepr today. None of them sends an edit token.
describe("share links", () => {
  const shareConfig = {
    backgroundLayer: { id: "stadtplan", selectedLayerId: "stadtplan" },
    layers: [],
    view: { center: [51.27256992259917, 7.199920713901521], zoom: 18 },
  };

  const share = (body: string) =>
    fetch(`${base}/store/${SHARE_FOLDER}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: GEOPORTAL_ORIGIN },
      body,
    });

  it("stores a share without a token and answers 201 with key and path", async () => {
    const response = await share(JSON.stringify(shareConfig));
    const body = (await response.json()) as { key: string; path: string };

    expect(response.status).toBe(201);
    expect(body.key).toMatch(/^[0-9a-f]{16}$/);
    expect(body.path).toBe(SHARE_FOLDER);
  });

  it("reads the share back under the folder path", async () => {
    const key = await keyOf(await share(JSON.stringify(shareConfig)));

    const response = await fetch(`${base}/config/${SHARE_FOLDER}/${key}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(shareConfig);
  });

  it("writes only the configuration file, no edit sidecar", async () => {
    const key = await keyOf(await share(JSON.stringify(shareConfig)));

    const files = fs
      .readdirSync(path.join(storageDir, SHARE_FOLDER))
      .filter((name) => name.startsWith(key));

    expect(files).toEqual([`${key}.json`]);
  });

  it("still serves a share lying at the root under the old /config/<key> route", async () => {
    const key = "00c0ffee00c0ffee";
    fs.writeFileSync(
      path.join(storageDir, `${key}.json`),
      JSON.stringify(shareConfig, null, 2)
    );

    const read = await fetch(`${base}/config/${key}`);

    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(shareConfig);
  });

  it("answers 404 for an unknown share key", async () => {
    const response = await fetch(
      `${base}/config/${SHARE_FOLDER}/0123456789abcdef`
    );

    expect(response.status).toBe(404);
  });

  it("rejects an empty body with 400", async () => {
    expect((await share("{}")).status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    expect((await share("{not json")).status).toBe(400);
  });

  it("lets the geoportal origin through the CORS preflight", async () => {
    const response = await fetch(`${base}/store/${SHARE_FOLDER}`, {
      method: "OPTIONS",
      headers: {
        Origin: GEOPORTAL_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      GEOPORTAL_ORIGIN
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST"
    );
  });
});
