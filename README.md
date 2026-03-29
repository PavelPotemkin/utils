# @pavelpotemkin/utils

Shared TypeScript utilities: Result type, HTTP client, validation, formatting.

## Install

```bash
npm install @pavelpotemkin/utils
```

## API

### Result

```ts
import { Ok, Err, isOk, isErr, unwrap, type Result } from '@pavelpotemkin/utils'

const result: Result<number> = Ok(42)

if (isOk(result)) {
  console.log(result.value) // 42
}

unwrap(Ok(42))          // 42
unwrap(Err(new Error())) // throws
```

### HttpClient

Axios-обёртка, возвращающая `Result` вместо исключений. Поддерживает zod-валидацию ответов.

```ts
import { HttpClient } from '@pavelpotemkin/utils'
import { z } from 'zod'

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  headers: { Authorization: 'Bearer token' },
  timeout: 5000,
})

const UserSchema = z.object({ id: z.number(), name: z.string() })

const result = await client.get('/users/1', { schema: UserSchema })

if (isOk(result)) {
  console.log(result.value) // { id: 1, name: "..." }
}
```

Методы: `get`, `post`, `put`, `patch`, `delete`.

Ошибки:
- `ApiError` — HTTP ошибки (4xx, 5xx) с полями `status`, `body`, `endpoint`
- `ResponseValidationError` — невалидный ответ по zod-схеме
- `NetworkError` — сетевые ошибки

### Validation

```ts
import { validateSchema, mustValue } from '@pavelpotemkin/utils'
import { z } from 'zod'

const data = validateSchema(z.object({ name: z.string() }), input) // throws ValidationError

const user = mustValue(maybeUser, 'User not found') // throws if null/undefined
```

### Format

```ts
import { formatFloatLine, formatCount } from '@pavelpotemkin/utils'

formatFloatLine(1234.5678, { accuracy: 2 })  // "1234.57"
formatFloatLine(1.999, { accuracy: 2, rounding: Decimal.ROUND_DOWN }) // "1.99"

formatCount(1500)       // { full: "1.5K", value: "1.5", postfix: "K", raw: Decimal }
formatCount(2_500_000)  // { full: "2.5M", ... }
```

### Nano

```ts
import { fromNanoToDecimal, fromDecimalToNano } from '@pavelpotemkin/utils'

fromNanoToDecimal('1500000000') // Decimal(1.5)
fromDecimalToNano(new Decimal(1.5)) // 1500000000
```

### Utils

```ts
import {
  awaitMs,
  getRandomInt,
  debounce,
  throttle,
  createDelayedResolver,
  hexToRgba,
} from '@pavelpotemkin/utils'

await awaitMs(100)
getRandomInt(1, 10)

const { debouncedFunction, cancel } = debounce(fn, 300)
const throttled = throttle(fn, 100)

const { promise, resolve } = createDelayedResolver<string>()

hexToRgba('#ff0000', 0.5) // "rgba(255, 0, 0, 0.5)"
```

### Types

```ts
import type { Optional, Brand } from '@pavelpotemkin/utils'

type UserId = Brand<string, 'UserId'>
const name: Optional<string> = null // string | null | undefined
```
