import { describe, expect, it } from "vitest";
import {
  clearRingBuffer,
  createRingBuffer,
  pushRingBufferEntry,
  readRingBufferEntries,
} from "./ring-buffer";

describe("ring-buffer helpers", () => {
  it("returns entries in insertion order", () => {
    let buffer = createRingBuffer<number>(3);
    buffer = pushRingBufferEntry(buffer, 1);
    buffer = pushRingBufferEntry(buffer, 2);
    buffer = pushRingBufferEntry(buffer, 3);

    expect(readRingBufferEntries(buffer)).toEqual([1, 2, 3]);
  });

  it("overwrites oldest entries when capacity is reached", () => {
    let buffer = createRingBuffer<number>(3);
    buffer = pushRingBufferEntry(buffer, 1);
    buffer = pushRingBufferEntry(buffer, 2);
    buffer = pushRingBufferEntry(buffer, 3);
    buffer = pushRingBufferEntry(buffer, 4);
    buffer = pushRingBufferEntry(buffer, 5);

    expect(readRingBufferEntries(buffer)).toEqual([3, 4, 5]);
  });

  it("clears all entries", () => {
    let buffer = createRingBuffer<number>(2);
    buffer = pushRingBufferEntry(buffer, 10);
    buffer = pushRingBufferEntry(buffer, 20);
    buffer = clearRingBuffer(buffer);

    expect(readRingBufferEntries(buffer)).toEqual([]);
    expect(buffer.count).toBe(0);
    expect(buffer.head).toBe(0);
  });

  it("throws for invalid capacity", () => {
    expect(() => createRingBuffer<number>(0)).toThrow(
      "RingBuffer capacity must be a positive integer"
    );
    expect(() => createRingBuffer<number>(1.5)).toThrow(
      "RingBuffer capacity must be a positive integer"
    );
  });
});
