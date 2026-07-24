# dao-sentinel-sdk

Typed JS/TS client for the [DAO Sentinel](https://daosentinel.xyz) public
governance API. Free public good — no paywalls, MIT-licensed, zero runtime
dependencies (uses the platform `fetch`).

## Install

```bash
npm install dao-sentinel-sdk
```

## Usage

Get a free API key from [Settings](https://daosentinel.xyz/settings) (any
signed-in account, 5,000 calls/month, no card required).

```ts
import { DaoSentinelClient } from 'dao-sentinel-sdk';

const client = new DaoSentinelClient({ apiKey: process.env.DAO_SENTINEL_API_KEY! });

const daos = await client.listDaos({ limit: 10 });

const { data: proposals } = await client.listProposals({
  state: 'active',
  dao: 'uniswap',
});

const alerts = await client.listAlerts({ severity: 'critical' });

console.log(client.lastRateLimit);
// { limitMonth: 5000, remainingMonth: 4998, remainingBurst: 4 }
```

## API

- `new DaoSentinelClient({ apiKey, baseUrl?, fetch? })`
- `client.listDaos({ limit? })` → `Dao[]`
- `client.listProposals({ state?, dao?, limit?, offset? })` → `{ data: Proposal[], limit, offset }`
- `client.listAlerts({ type?, severity?, limit? })` → `Alert[]`
- `client.lastRateLimit` — rate-limit info from the most recent response's headers, or `null` before the first request
- Non-2xx responses throw `DaoSentinelError` with `.status` and `.body` (the parsed JSON error payload, e.g. `{ error: 'invalid_api_key' }`)

Full endpoint reference, response shapes, and rate limits:
[daosentinel.xyz/api-docs](https://daosentinel.xyz/api-docs).

## License

MIT — see [LICENSE](./LICENSE). Same license as the
[main DAO Sentinel repo](https://github.com/Dev-In-Crypt/DAOsentinel).
