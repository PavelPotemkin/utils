import { ValidationError } from "./errors";
import type { ValidationSchema } from "./http-client";
import type { Optional } from "./types";

export const validateSchema = <T>(schema: ValidationSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);

  if (!result.success) {
    const maybeError = result.error.issues[0];

    if (maybeError) {
      throw new ValidationError(`${maybeError.path.join(".")} ${maybeError.message}`);
    }

    throw new ValidationError(result.error.message);
  }

  return result.data;
};

export const mustValue = <T>(value: Optional<T>, message: string): T => {
  if (value === null || value === undefined) throw new Error(message);
  return value;
};
