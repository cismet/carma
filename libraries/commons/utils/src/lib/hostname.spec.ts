import { describe, expect, it } from "vitest";
import { isLocalhostHostname } from "./hostname";

describe("isLocalhostHostname", () => {
  it("accepts loopback, private network and mDNS hosts", () => {
    for (const hostname of [
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "192.168.100.64",
      "10.0.0.7",
      "172.16.3.9",
      "172.31.255.254",
      "169.254.10.1",
      "fd00::1",
      "[fe80::1]",
      "macbook.local",
      "app.localhost",
    ])
      expect(isLocalhostHostname(hostname)).toBe(true);
  });

  it("rejects public hosts and near misses", () => {
    for (const hostname of [
      "geoportal.wuppertal.de",
      "172.32.0.1",
      "172.15.0.1",
      "192.169.0.1",
      "11.0.0.1",
      "notlocal.localdomain",
      "local",
      "",
      null,
      undefined,
    ])
      expect(isLocalhostHostname(hostname)).toBe(false);
  });
});
