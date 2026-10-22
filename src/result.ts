/** Successful result. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed result. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result of an operation that does not throw: `{ ok: true, value } | { ok: false, error }`. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Value of a successful result. For a failed one throws the error itself when it is an `Error`,
 * otherwise an `Error` with the original value in `cause`.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  if (result.error instanceof Error) throw result.error;
  throw new Error(`unwrap() on Err: ${String(result.error)}`, { cause: result.error });
}
