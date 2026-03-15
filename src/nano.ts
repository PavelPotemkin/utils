import { Decimal } from "decimal.js";

export const fromNanoToDecimal = (
  value: string | bigint | number,
): Decimal => {
  return new Decimal(String(value)).div(1e9);
};

export const fromDecimalToNano = (value: Decimal): number => {
  return value.mul(1e9).toNumber();
};
