import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  awaitMs,
  getRandomInt,
  createDelayedResolver,
  debounce,
  throttle,
  hexToRgba,
} from "../src/utils";

describe("Utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("awaitMs", () => {
    it("resolves after specified time", async () => {
      const promise = awaitMs(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe("getRandomInt", () => {
    it("returns integer within range", () => {
      vi.useRealTimers();
      for (let i = 0; i < 100; i++) {
        const result = getRandomInt(1, 10);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(10);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it("works with same min and max", () => {
      vi.useRealTimers();
      expect(getRandomInt(5, 5)).toBe(5);
    });

    it("handles float inputs by ceiling/flooring", () => {
      vi.useRealTimers();
      for (let i = 0; i < 50; i++) {
        const result = getRandomInt(1.2, 3.8);
        expect(result).toBeGreaterThanOrEqual(2);
        expect(result).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("createDelayedResolver", () => {
    it("resolves promise when resolve is called", async () => {
      vi.useRealTimers();
      const { promise, resolve } = createDelayedResolver<number>();
      resolve(42);
      await expect(promise).resolves.toBe(42);
    });

    it("works with complex types", async () => {
      vi.useRealTimers();
      const { promise, resolve } = createDelayedResolver<{ name: string }>();
      resolve({ name: "test" });
      await expect(promise).resolves.toEqual({ name: "test" });
    });
  });

  describe("debounce", () => {
    it("delays function execution", () => {
      const fn = vi.fn();
      const { debouncedFunction } = debounce(fn, 100);

      debouncedFunction();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets timer on subsequent calls", () => {
      const fn = vi.fn();
      const { debouncedFunction } = debounce(fn, 100);

      debouncedFunction();
      vi.advanceTimersByTime(50);
      debouncedFunction();
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("cancel prevents execution", () => {
      const fn = vi.fn();
      const { debouncedFunction, cancel } = debounce(fn, 100);

      debouncedFunction();
      cancel();
      vi.advanceTimersByTime(200);

      expect(fn).not.toHaveBeenCalled();
    });

    it("uses default delay of 300ms", () => {
      const fn = vi.fn();
      const { debouncedFunction } = debounce(fn);

      debouncedFunction();
      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("throttle", () => {
    it("executes immediately on first call", () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("blocks subsequent calls within delay", () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("allows call after delay passes", () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("hexToRgba", () => {
    it("converts 6-char hex", () => {
      expect(hexToRgba("#ff0000", 1)).toBe("rgba(255, 0, 0, 1)");
      expect(hexToRgba("#00ff00", 0.5)).toBe("rgba(0, 255, 0, 0.5)");
      expect(hexToRgba("#0000ff", 0)).toBe("rgba(0, 0, 255, 0)");
    });

    it("converts 3-char hex", () => {
      expect(hexToRgba("#f00", 1)).toBe("rgba(255, 0, 0, 1)");
      expect(hexToRgba("#0f0", 0.5)).toBe("rgba(0, 255, 0, 0.5)");
    });

    it("handles without # prefix", () => {
      expect(hexToRgba("ff0000", 1)).toBe("rgba(255, 0, 0, 1)");
    });

    it("handles whitespace", () => {
      expect(hexToRgba("  #ff0000  ", 1)).toBe("rgba(255, 0, 0, 1)");
    });

    it("returns white fallback for invalid hex", () => {
      expect(hexToRgba("invalid", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
      expect(hexToRgba("#xyz", 1)).toBe("rgba(255, 255, 255, 1)");
    });

    it("converts mixed case", () => {
      expect(hexToRgba("#FF8800", 1)).toBe("rgba(255, 136, 0, 1)");
      expect(hexToRgba("#aaBBcc", 1)).toBe("rgba(170, 187, 204, 1)");
    });
  });
});
