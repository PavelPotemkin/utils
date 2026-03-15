export type Optional<T> = T | null | undefined;

export type Brand<T, B> = T & { __brand: B };
