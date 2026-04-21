// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  encodeHashFragment,
  encodeHashParams,
} from "@carma-providers/hash-state";

import { normalizeShareHashParams } from "./shareHash";

describe("normalizeShareHashParams", () => {
  it("drops canonical managed keys when an alias key is already present", () => {
    expect(
      normalizeShareHashParams({
        lat: "51.2677",
        lng: "7.19163",
        zoom: "17",
        pitch: "50",
        p: "40",
        bearing: "90",
        b: "180",
        config: "abc",
        appKey: "sharedurl",
      })
    ).toEqual({
      lat: "51.2677",
      lng: "7.19163",
      zoom: "17",
      p: "40",
      b: "180",
    });
  });

  it("allows overriding omitted keys", () => {
    expect(
      normalizeShareHashParams(
        {
          lat: "51.2677",
          lng: "7.19163",
          config: "abc",
          appKey: "sharedurl",
        },
        {
          omittedKeys: ["config"],
        }
      )
    ).toEqual({
      lat: "51.2677",
      lng: "7.19163",
      appKey: "sharedurl",
    });
  });
});

describe("normalizeShareHashParams + encodeHashParams", () => {
  it("serializes shared map params with canonical aliases only", () => {
    expect(
      encodeHashParams(
        normalizeShareHashParams({
          lat: "51.2677",
          lng: "7.19163",
          zoom: "17",
          pitch: "45",
          bearing: "180",
          altitude: "157",
          roll: "12",
          mapStyle: "karte",
          foo: "bar",
        })
      )
    ).toBe("lat=51.2677&lng=7.19163&zoom=17&b=180&p=45&r=12&h=157&m=0&foo=bar");
  });

  it("prefers alias values over long-form managed keys in copied share links", () => {
    expect(
      encodeHashParams(
        normalizeShareHashParams({
          lat: "51.2677",
          lng: "7.19163",
          zoom: "17",
          pitch: "50",
          p: "40",
          mapStyle: "karte",
          m: "1",
        })
      )
    ).toBe("lat=51.2677&lng=7.19163&zoom=17&p=40&m=1");
  });

  it("adds the hash fragment prefix through a dedicated wrapper", () => {
    const normalizedParams = normalizeShareHashParams({
      lat: "51.2677",
      lng: "7.19163",
      zoom: "17",
      pitch: "45",
      bearing: "180",
    });

    expect(encodeHashFragment(normalizedParams)).toBe(
      `#?${encodeHashParams(normalizedParams)}`
    );
  });
});
