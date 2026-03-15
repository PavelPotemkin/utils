export type Ok<T> = {
  ok: true;
  value: T;
};

export type Err<E extends Error> = {
  ok: false;
  error: E;
};

export type Result<T, E extends Error = Error> = Ok<T> | Err<E>;

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const Err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E extends Error = Error>(result: Result<T, E>): result is Ok<T> => result.ok;
export const isErr = <T, E extends Error = Error>(result: Result<T, E>): result is Err<E> => !result.ok;

export const unwrap = <T, E extends Error = Error>(result: Result<T, E>): T => {
  if (isOk(result)) return result.value;
  throw result.error;
};
