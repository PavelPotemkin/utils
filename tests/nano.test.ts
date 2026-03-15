import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { fromNanoToDecimal, fromDecimalToNano } from "../src/nano";

describe("Nano", () => {
  describe("fromNanoToDecimal", () => {
    it("converts nano to decimal", () => {
      expect(fromNanoToDecimal("1000000000").toNumber()).toBe(1);
      expect(fromNanoToDecimal("500000000").toNumber()).toBe(0.5);
      expect(fromNanoToDecimal("1500000000").toNumber()).toBe(1.5);
    });

    it("handles number input", () => {
      expect(fromNanoToDecimal(1000000000).toNumber()).toBe(1);
    });

    it("handles bigint input", () => {
      expect(fromNanoToDecimal(BigInt("1000000000")).toNumber()).toBe(1);
    });

    it("handles zero", () => {
      expect(fromNanoToDecimal("0").toNumber()).toBe(0);
    });

    it("handles very small values", () => {
      expect(fromNanoToDecimal("1").toNumber()).toBe(1e-9);
    });

    it("returns Decimal instance", () => {
      expect(fromNanoToDecimal("1000000000")).toBeInstanceOf(Decimal);
    });
  });

  describe("fromDecimalToNano", () => {
    it("converts decimal to nano", () => {
      expect(fromDecimalToNano(new Decimal(1))).toBe(1000000000);
      expect(fromDecimalToNano(new Decimal(0.5))).toBe(500000000);
      expect(fromDecimalToNano(new Decimal(1.5))).toBe(1500000000);
    });

    it("handles zero", () => {
      expect(fromDecimalToNano(new Decimal(0))).toBe(0);
    });

    it("handles very small values", () => {
      expect(fromDecimalToNano(new Decimal("0.000000001"))).toBe(1);
    });
  });
});
