/** Nominal type: `Brand<string, "UserId">` is a `string` that a plain `string` is not assignable to. */
export type Brand<T, B> = T & { readonly __brand: B };
