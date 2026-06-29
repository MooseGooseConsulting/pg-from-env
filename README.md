# pg-from-env

> The boring Postgres pool factory. One function call per database, named env prefixes, nothing clever.

```ts
import { createDbPool, createDbPools } from "pg-from-env";

// One database
const hangar = createDbPool({ prefix: "HANGAR_DB" });

// Many databases
const { hangar, auth, analytics } = createDbPools({
  prefixes: ["HANGAR_DB", "AUTH_DB", "ANALYTICS_DB"],
});
```

## Why

In 2026, every Node.js app that talks to Postgres reinvents the same 25 lines: read `PGHOST`/`PGPORT`/etc., load a CA cert, wire up `pg.Pool`, and hope nobody put `sslmode` in the connection string. This library standardizes that into one function call.

## Env contract

For a prefix like `HANGAR_DB`:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `HANGAR_DB_HOST` | yes | — | PostgreSQL host |
| `HANGAR_DB_PORT` | no | `5432` | PostgreSQL port |
| `HANGAR_DB_NAME` | yes | — | Database name |
| `HANGAR_DB_USER` | yes | — | Database user |
| `HANGAR_DB_PASSWORD` | yes | — | Database password (the only secret) |
| `HANGAR_DB_SSLMODE` | no | — | Set to `"disable"` to skip SSL; otherwise enables TLS |
| `HANGAR_DB_CA_PATH` | no | — | Path to CA certificate file |
| `HANGAR_DB_KEY_PATH` | no | — | Path to client key file (mTLS) |
| `HANGAR_DB_CERT_PATH` | no | — | Path to client certificate file (mTLS) |
| `HANGAR_DB_POOL_MAX` | no | `10` | Max pool connections |
| `HANGAR_DB_POOL_IDLE_TIMEOUT_MS` | no | `30000` | Idle connection timeout |
| `HANGAR_DB_POOL_CONNECT_TIMEOUT_MS` | no | `2000` | Connection timeout |
| `HANGAR_DB_POOL_MAX_LIFETIME_SECONDS` | no | `1800` | Max connection lifetime |

## TLS / SSL

- Set `SSLMODE` to anything other than `"disable"` to enable TLS.
- If `CA_PATH` is set, the certificate is read with `fs.readFileSync` and passed as `ssl.ca`.
- If `KEY_PATH` and `CERT_PATH` are set, they're included for mTLS.
- `sslmode` is **never** placed in a connection string — TLS config is always passed as a structured `ssl` object to `pg.Pool`.

## Overrides

Pass `overrides` to override any config value. Takes precedence over environment variables:

```ts
const pool = createDbPool({
  prefix: "HANGAR_DB",
  overrides: { max: 20, idleTimeoutMillis: 60_000 },
});
```

## Errors

Throws `MissingConfigError` with a clear message when a required variable is missing:

```
MissingConfigError: HANGAR_DB_HOST is required. Set it in your environment or pass it as an override.
```

## Project use cases

See [docs/use-cases.md](docs/use-cases.md) for how this package should fit RobotOverview/Hangar, TechdealsHandoff, and the coldaine-k8cluster database contract.

## Installation

```bash
npm install pg-from-env pg
```

`pg` is a peer dependency — you already have it.

## License

MIT
