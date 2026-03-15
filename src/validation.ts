import type { z } from "zod";
import type { Optional } from "./types";
import { ValidationError } from "./errors";

export const validateSchema = <T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    const maybeError = result.error.errors[0];

    if (maybeError) {
      throw new ValidationError(
        maybeError.path.join(".") + " " + maybeError.message,
      );
    }

    throw new ValidationError(result.error.message);
  }

  return result.data;
};

export const mustValue = <T>(value: Optional<T>, message: string): T => {
  if (value === null || value === undefined) throw new Error(message);
  return value;
};
