# Changelog

## 2.0.0

A rewrite around one error class and a client that never throws. Breaking: there are no 1.x compatibility shims.

### Highlights

- `Result` has the same names and shape as `@pavelpotemkin/portals-market-api-sdk` 2.x: `ok`, `err`, `isOk`,
  `isErr`, `unwrap`, types `Ok<T>`, `Err<E>`, `Result<T, E = Error>`.
- One error class `HttpError` with `kind`: `http`, `network`, `timeout`, `aborted`, `parse`, `validation`.
  `isHttpError(error, ...kinds)` narrows it (`"http"` → `status: number`).
- `HttpClient` stays on axios and keeps `client.axios` public (interceptors, `defaults.adapter` mocks, direct calls).
  New: `timeoutMs` (client and per request) that works even with adapters ignoring `signal`, `aborted`/`timeout`
  separated from network errors, non-JSON 2xx → `parse`, raw body text kept in `body`, `retryable`, `request()`.
- Schemas are structural (`safeParse`): zod 3, zod 4 or custom. zod is no longer a peer dependency.
- Peer `axios@^1.20.0` (all advisories published up to 2026-09-30 are fixed in 1.20.0; earlier 1.x are affected).
- `decimal.js` is no longer a peer: the decimal helpers are removed (see below).
- `sideEffects: false`, `engines.node >= 20`, ES2022 output.

### Migration from 1.x

#### Package

| 1.x | 2.0 |
| --- | --- |
| peers `axios@^1.7`, `decimal.js@^10.4`, `zod@^3.24 \|\| ^4` | peer `axios@^1.20.0` only |
| — | `sideEffects: false`, `node >= 20`, ES2022 |

#### Result

| 1.x | 2.0 | Notes |
| --- | --- | --- |
| `Ok(value)` | `ok(value)` | returns `Ok<T>` (was `Result<T>`); assignable to any `Result<T, E>` |
| `Err(error)` | `err(error)` | returns `Err<E>` (was `Result<never, E>`); `E` no longer has to extend `Error` |
| `type OkType<T>`, `type ErrType<E>` | `type Ok<T>`, `type Err<E>` | fields are `readonly` |
| `type Result<T, E extends Error = Error>` | `type Result<T, E = Error>` | same shape `{ ok, value } \| { ok, error }` |
| `isOk`, `isErr` | same | |
| `unwrap(result)` | same | a non-`Error` error is thrown as `Error` with it in `cause` |

```ts
// 1.x
import { Ok, Err, type Result } from "@pavelpotemkin/utils";
const r: Result<number> = cond ? Ok(1) : Err(new Error("x"));
// 2.0
import { ok, err, type Result } from "@pavelpotemkin/utils";
const r: Result<number> = cond ? ok(1) : err(new Error("x"));
```

#### Errors

| 1.x | 2.0 |
| --- | --- |
| `HttpError` (empty base class) | `HttpError` — the only class, `kind` tells what happened |
| `ApiError` | `HttpError` with `kind: "http"` |
| `NetworkError` | `kind: "network"`, `"timeout"` or `"aborted"` (1.x put all three into `NetworkError`) |
| `ResponseValidationError` | `kind: "validation"` |
| — (2xx non-JSON was returned as a string) | `kind: "parse"`, raw text in `body` |
| `error instanceof ApiError` | `isHttpError(error, "http")` (narrows `status` to `number`) |
| `error instanceof NetworkError` | `isHttpError(error, "network", "timeout", "aborted")` for exact 1.x parity |
| `error instanceof ResponseValidationError` | `isHttpError(error, "validation")` |
| `apiError.body` (parsed JSON or raw string) | `error.data` (parsed JSON); `error.body` is now the **raw text** |
| `apiError.statusText` | part of `error.message`, no field |
| `apiError.status`, `endpoint`, `isBadRequest`, `isUnauthorized`, `isNotFound`, `isServerError`, `isRateLimited` | same; getters are `false` for non-`http` kinds |
| — | `method`, `code` (from body `code`), `retryable`, `issues` |
| `validationError.zodError.issues` | `error.issues` |
| `validationError.rawData` | `error.data` |
| `networkError.cause` | `error.cause` (`network`/`timeout`/`aborted`) |
| message `[404] /users/1: User not found` | `GET /users/1: HTTP 404: User not found` (same rule: `body.message` if a non-empty string, else `statusText`) |
| message `Network error for /x: canceled` | `GET /x: request canceled` (still contains `canceled`) |
| `ValidationError` | removed (see Removed) |

**Watch out:** `error.body` still exists but is now a `string | undefined`. Code like `schema.safeParse(error.body)` or
`error.body as {...}` compiles and silently stops matching. Rename every read of the parsed error body to `error.data`.

```ts
// 1.x
if (error instanceof ApiError && error.status === 409) parse(error.body);
if (error instanceof NetworkError) retry();
if (error instanceof ResponseValidationError) log(error.endpoint, error.zodError.issues, error.rawData);
// 2.0
if (isHttpError(error, "http") && error.status === 409) parse(error.data);
if (isHttpError(error, "network", "timeout", "aborted")) retry();
if (isHttpError(error, "validation")) log(error.endpoint, error.issues, error.data);
```

Constructing errors in tests and mocks:

```ts
// 1.x
new ApiError({ status: 422, statusText: "Unprocessable Entity", body: { error: "X" }, endpoint: "/bet" });
new NetworkError({ cause: new Error("offline"), endpoint: "/x" });
// 2.0 — message, code and retryable are derived when omitted
new HttpError({ kind: "http", method: "POST", endpoint: "/bet", status: 422, data: { error: "X" } });
new HttpError({ kind: "network", method: "GET", endpoint: "/x", cause: new Error("offline") });
// a string body in 1.x (`body: "<html>"`) becomes `body: "<html>"` with no `data`
```

#### HttpClient

| 1.x | 2.0 |
| --- | --- |
| `new HttpClient({ baseURL, headers, timeout, withCredentials })` | `new HttpClient({ baseURL, headers, timeoutMs, withCredentials })` — `timeout` → `timeoutMs`; it is no longer written to `axios.defaults.timeout` |
| `client.axios` | same `AxiosInstance`; interceptors and `defaults.adapter` overrides keep working |
| `get/post/put/patch/delete` → `Result<T, HttpError>` | same signatures; plus `request(method, path, body, options)` |
| options `params`, `schema`, `headers`, `signal` | same; new `timeoutMs`, `responseType: "json" \| "text"` |
| `ValidationSchema<T>` (zod `ZodError` in the type) | structural `ValidationSchema<T>` with `ValidationIssue` |
| `HttpClientConfig`, `RequestOptions` types | same names |
| any failure without a response → `NetworkError` | `network` / `timeout` / `aborted` |
| 2xx non-JSON body → value was the raw string | `Err` with `kind: "parse"`; use `responseType: "text"` for text endpoints |
| empty body → value `""` | value `undefined` |
| array params `[]` → `key=` | key omitted; `null`/`undefined` items are dropped |
| a throwing interceptor or schema → rejected promise or `NetworkError` | always `Err`, never a rejection |

Requests are sent with `responseType: "text"` and parsed by the client so the raw body is available. Direct
`client.axios.get(...)` calls are not affected and still get axios-parsed JSON. Mock adapters that return objects
work as before: the object is used as the parsed body.

```ts
// 1.x
new HttpClient({ baseURL: url, timeout: 20_000 });
// 2.0
new HttpClient({ baseURL: url, timeoutMs: 20_000 });
```

#### Removed

No Portals consumer uses them; `minegram` stays on `^1`.

| Removed | Why / replacement |
| --- | --- |
| `formatFloatLine`, `formatCount`, `sanitizeFloatLine`, `trimTrailingZeroes`, `getDecimal`, `type CountFormat` | needed `decimal.js`; had bugs (exponent notation `1e21` → `"121"`, `1e-7` → `"17"`; `formatCount(999_950)` → `"1000K"`; negatives never abbreviated; a no-op thousands regex). Use `decimal.js` / `Intl.NumberFormat` in the app |
| `fromNanoToDecimal`, `fromDecimalToNano` | `fromDecimalToNano` returned a float `number` (non-integer nano, precision loss above 2^53). Use `fromNano`/`toNano` from `@ton/core` (bigint, exact) |
| `awaitMs`, `getRandomInt`, `debounce`, `throttle`, `createDelayedResolver`, `hexToRgba` | generic helpers unrelated to the package purpose; `setTimeout`, `use-debounce`, `Promise.withResolvers` cover them |
| `validateSchema`, `mustValue`, `ValidationError`, `type Optional` | throwing helpers inconsistent with `Result`; `schema.parse()` throws a richer error, `mustValue` is a one-line check |

`type Brand<T, B>` is kept (now with a `readonly` brand field).
