import { Decimal } from "decimal.js";

export const getDecimal = (line: string | number): Decimal | undefined => {
  try {
    const d = new Decimal(line);
    return d.isNaN() ? undefined : d;
  } catch {
    return undefined;
  }
};

type JoinMode = "auto" | "emptyFractional";

const joinParts = (
  whole: string | undefined,
  fractional: string | undefined,
  hasPoint: boolean,
  mode: JoinMode = "auto",
): string => {
  if (mode === "emptyFractional") {
    if (hasPoint) return `${whole || "0"}.${fractional || ""}`;
    return `${whole || "0"}${fractional ? `.${fractional}` : ""}`;
  }
  return `${whole || "0"}.${fractional || "0"}`;
};

export const sanitizeFloatLine = (line: string, join?: JoinMode): string => {
  line = line.replace(/[^\d.-]/g, "");
  const isNegative = line.startsWith("-");

  line = line.replaceAll("-", "").replace(".", " ").replaceAll(".", "").replace(" ", ".");

  let [whole, fractional] = line.split(".");

  if (whole) whole = whole.replace(/^0+/g, "");
  if (fractional) fractional = fractional.replace(/0+$/g, "");

  const joined = joinParts(whole, fractional, line.includes("."), join);
  return isNegative ? `-${joined}` : joined;
};

export const trimTrailingZeroes = (line: string): string => {
  const [whole, fractional] = line.split(".");
  if (!fractional) return line;

  const trimmed = fractional.replace(/0+$/g, "");
  return trimmed ? [whole, trimmed].join(".") : whole!;
};

type AsNumber = string | number | Decimal;

export const formatFloatLine = (
  line: AsNumber,
  options?: {
    accuracy?: number;
    rounding?: Decimal.Rounding;
    join?: JoinMode;
    trim?: boolean;
  },
): string => {
  options = {
    ...(options ?? {}),
    trim: options?.trim ?? true,
  };

  if (typeof line === "number") line = line.toString();
  if (line instanceof Decimal) line = line.toFixed();

  line = sanitizeFloatLine(line, options.join);

  line = (() => {
    if (options!.accuracy === undefined) return line as string;

    if (options!.rounding) return new Decimal(line).toFixed(options!.accuracy, options!.rounding);
    else return new Decimal(line).toFixed(options!.accuracy);
  })();

  const isNegative = line.startsWith("-");
  const lineParts = line.replace("-", "").split(".");

  const whole = lineParts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, "");

  const joined = (() => {
    if (lineParts[1] === undefined) return isNegative ? `-${whole}` : whole;

    const joined = joinParts(whole, lineParts[1], line.includes("."), options.join);
    return isNegative ? `-${joined}` : joined;
  })();

  return options.trim ? trimTrailingZeroes(joined) : joined;
};

export interface CountFormat {
  full: string;
  value: string;
  postfix: string;
  raw: Decimal;
}

export const formatCount = (
  count: number | string | Decimal,
  { accuracy = 1, trim }: { accuracy?: number; trim?: boolean } = { accuracy: 1 },
): CountFormat => {
  if (typeof count === "string") count = parseFloat(count);
  if (count instanceof Decimal) count = count.toNumber();

  const divider = (() => {
    if (count >= 1_000_000_000) return { value: 1_000_000_000, postfix: "B" };
    else if (count >= 1_000_000) return { value: 1_000_000, postfix: "M" };
    else if (count >= 1_000) return { value: 1_000, postfix: "K" };
    else return { value: 1, postfix: "" };
  })();

  const raw = new Decimal(count);
  const value = formatFloatLine(count / divider.value, { accuracy, trim });

  return {
    full: `${value}${divider.postfix}`,
    value,
    postfix: divider.postfix,
    raw,
  };
};
