# Use cases: RobotOverview, TechdealsHandoff, and coldaine-k8cluster

`pg-from-env` should be the small app-side adapter between Patrick's database contract and `pg.Pool`.
It should not become a migration framework, an ORM, a Kubernetes operator, or a secret manager.

The shared pattern is:

1. The platform declares the database location and role.
2. Non-secret connection coordinates live as ordinary runtime config.
3. The password/token/certificate material comes from the secret system.
4. A Node app reads one named prefix and creates one `pg.Pool` config object.
5. TLS stays in the structured `ssl` object, never in a credential-bearing URL.

That is the exact seam this package owns.

## Shared environment contract

For an app-owned database prefix such as `HANGAR_DB`, `TECHDEALS_WORK_DB`, or `MARKET_RAW_DB`:

```env
HANGAR_DB_HOST=pg18-rw.data-platform.svc.cluster.local
HANGAR_DB_PORT=5432
HANGAR_DB_NAME=hangar
HANGAR_DB_USER=<registry role>
HANGAR_DB_SSLMODE=require
HANGAR_DB_PASSWORD=<secret materialized at runtime>
```

Optional TLS material, when the platform moves beyond system trust / basic TLS:

```env
HANGAR_DB_CA_PATH=/var/run/secrets/postgres/ca.crt
HANGAR_DB_KEY_PATH=/var/run/secrets/postgres/tls.key
HANGAR_DB_CERT_PATH=/var/run/secrets/postgres/tls.crt
```

The host, port, database name, role, and SSL mode are configuration. The password/key/cert material is
secret. If a framework absolutely requires `DATABASE_URL`, generate it as a compatibility shim from this
contract rather than storing a password-bearing URL as the source of truth.

## RobotOverview / Hangar

Current RobotOverview docs say the app still reads `src/data/hangar.ts` at runtime, while the Postgres
schema in `db/hangar/` is the intended authoritative store after the cluster database is provisioned,
seeded, preflighted, parity-checked, and the read path is cut over. That makes RobotOverview the first
natural consumer of this package.

### Suggested use cases

1. **Replace the local hand-rolled Hangar pool config.**
   The server-side Hangar DB helper can import `createDbPool({ prefix: "HANGAR_DB" })` instead of keeping
   bespoke env parsing around `HANGAR_DB_*`, `HANGAR_DATABASE_URL`, and `DATABASE_URL`. Compatibility URL
   support can remain temporarily if the repo still needs it, but the preferred path should be the named
   prefix.

2. **Keep the DB preflight boring and explicit.**
   RobotOverview already has a no-fallback preflight concept: return green only when Postgres answers.
   `readDbConfig({ prefix: "HANGAR_DB" })` gives that endpoint a single source for validation before it
   runs `SELECT 1`.

3. **Make the static-data fallback visibly transitional.**
   The app can continue falling back to `src/data/hangar.ts` while the database cutover is incomplete, but
   the presence or absence of a valid `HANGAR_DB_*` block becomes the clean switch. That keeps the cutover
   easy to reason about: no DB config means static bootstrap; valid DB config means try Postgres.

4. **Use the same pool for the connected-twin extension.**
   The next Hangar model layer - terminals, nets, source-document provenance, and Beast archive metadata -
   should use the same `HANGAR_DB` pool. Do not add a second database prefix unless the data genuinely
   belongs to a different logical database.

5. **Keep browser/client code away from connection details.**
   `pg-from-env` belongs only in server-side code: Next route handlers, server modules, preflight scripts,
   seed/parity tools, or deployment smoke tests. It should never be imported by client components.

### Concrete RobotOverview proposal

When RobotOverview is ready for a small integration PR:

- Add `pg-from-env` as an app dependency.
- Update `src/server/hangar/db.ts` to prefer `createDbPool({ prefix: "HANGAR_DB" })`.
- Keep existing URL compatibility only as a temporary migration path, clearly marked.
- Update `docs/components/data-backend.md` to name `pg-from-env` as the app-side DB config helper.
- Add a focused test around missing `HANGAR_DB_PASSWORD` / missing host / successful config.
- Run the existing `npm run lint`, `npm run build`, and `npm run test:run` gates.

Do not declare Postgres authoritative just because the helper is installed. The existing gates still matter:
cluster DB reserved, secrets wired, schema applied, seed loaded, preflight green, parity checked, reads cut
over, rollback understood.

## TechdealsHandoff

Current TechdealsHandoff docs describe one PostgreSQL 18 cluster with separate logical databases:

- `market_raw`: exhaustive source-native imports plus raw registry metadata.
- `techdeals_work`: selective working schema for deal-answering queries.

The k8cluster connection registry already lists `techdeals_work`, `market_raw`, and `market_live` as planned
logical databases in `pg18`, owned by TechdealsHandoff. That makes TechdealsHandoff the clearest example of
why one global `DATABASE_URL` is the wrong shape: the repo may need multiple named pools at the same time.

### Suggested use cases

1. **Use one prefix per logical database.**
   Techdeals should not flatten its raw, working, and future live surfaces into one ambiguous connection
   name. Suggested app/script prefixes:

   ```env
   MARKET_RAW_DB_HOST=pg18-rw.data-platform.svc.cluster.local
   MARKET_RAW_DB_PORT=5432
   MARKET_RAW_DB_NAME=market_raw
   MARKET_RAW_DB_USER=techdeals
   MARKET_RAW_DB_SSLMODE=require
   MARKET_RAW_DB_PASSWORD=<secret materialized at runtime>

   TECHDEALS_WORK_DB_HOST=pg18-rw.data-platform.svc.cluster.local
   TECHDEALS_WORK_DB_PORT=5432
   TECHDEALS_WORK_DB_NAME=techdeals_work
   TECHDEALS_WORK_DB_USER=techdeals
   TECHDEALS_WORK_DB_SSLMODE=require
   TECHDEALS_WORK_DB_PASSWORD=<secret materialized at runtime>

   MARKET_LIVE_DB_HOST=pg18-rw.data-platform.svc.cluster.local
   MARKET_LIVE_DB_PORT=5432
   MARKET_LIVE_DB_NAME=market_live
   MARKET_LIVE_DB_USER=techdeals
   MARKET_LIVE_DB_SSLMODE=require
   MARKET_LIVE_DB_PASSWORD=<secret materialized at runtime>
   ```

   The exact role/password key should follow `coldaine-k8cluster/docs/connection-registry.md`; the point is
   the naming shape, not hard-coding final credentials in this docs repo.

2. **Create multiple pools explicitly where scripts cross boundaries.**

   ```ts
   import { createDbPools } from "pg-from-env";

   const db = createDbPools({
     prefixes: ["MARKET_RAW_DB", "TECHDEALS_WORK_DB"],
   });

   await db.marketRaw.query("select 1");
   await db.techdealsWork.query("select 1");
   ```

   This matches the documented ingest flow: raw source-native imports land first in `market_raw`; mapping into
   `techdeals_work` happens only after source tables have landed and row counts match.

3. **Keep ingestion lineage separate from connection mechanics.**
   `pg-from-env` should not know about source artifacts, mapping runs, DuckDB imports, row hashes, coverage
   reports, or deal-ranking queries. It only gives the importer or app a correctly configured pool.

4. **Make local proof and cluster runtime differ only by environment.**
   Techdeals currently has local PostgreSQL/Docker proof machinery. The same script can target local proof or
   cluster runtime by swapping `*_DB_HOST`, `*_DB_PORT`, and secret material. The code path should not fork just
   because the database moved from local Docker to `pg18`.

5. **Use the package for smoke checks and audit scripts, not only web services.**
   Techdeals is ingestion/script-heavy. `pg-from-env` is still useful there because every importer, mapper,
   audit, and coverage generator can share the same connection contract.

### Concrete TechdealsHandoff proposal

When TechdealsHandoff is ready for an integration PR:

- Add `pg-from-env` to the Node/TypeScript side if/when those scripts exist or are introduced.
- Add a short DB config contract doc naming `MARKET_RAW_DB`, `TECHDEALS_WORK_DB`, and `MARKET_LIVE_DB`.
- Update any Node ingestion/audit scripts to use `createDbPool` / `createDbPools` instead of ad hoc env parsing.
- Keep Python scripts on their native `psycopg`/SQLAlchemy config unless a separate Python helper is wanted; do
  not force this Node package into Python code.
- Align the env prefixes with the k8cluster registry before deployment depends on them.

## coldaine-k8cluster

Current k8cluster docs say app databases are declared by the cluster repo and listed in
`docs/connection-registry.md`; everything is still `planned` until the platform, clusters, roles, and
secrets exist. The package should influence the cluster repo by making Node app DB contracts uniform, not by
changing how Kubernetes itself is managed.

### Suggested use cases

1. **Standardize Node app database environment names.**
   For Node services, the app template can recommend `<APP>_DB_*` prefixes that match `pg-from-env`:
   `HOST`, `PORT`, `NAME`, `USER`, `SSLMODE`, and `PASSWORD`.

2. **Make the connection registry directly translatable into manifests.**
   A registry row should be enough to fill a ConfigMap/manifest block:

   ```yaml
   - name: HANGAR_DB_HOST
     value: pg18-rw.data-platform.svc.cluster.local
   - name: HANGAR_DB_PORT
     value: "5432"
   - name: HANGAR_DB_NAME
     value: hangar
   - name: HANGAR_DB_USER
     value: <registry role>
   - name: HANGAR_DB_SSLMODE
     value: require
   - name: HANGAR_DB_PASSWORD
     valueFrom:
       secretKeyRef:
         name: hangar-db
         key: password
   ```

   Exact role and secret names should come from the current connection registry, not from the package.

3. **Keep Doppler/ESO as the source of secret material.**
   `pg-from-env` expects `HANGAR_DB_PASSWORD` to exist at process startup. It does not know whether that
   value came from Doppler, ESO, a projected secret, a local shell, or a CI job. The cluster repo remains
   responsible for making missing secrets fail loud.

4. **Support app-specific smoke jobs and preflight scripts.**
   A Node smoke test can use the same package as the app:

   ```ts
   import { createDbPool } from "pg-from-env";

   const pool = createDbPool({ prefix: "HANGAR_DB" });
   await pool.query("select 1");
   await pool.end();
   ```

   That is useful for deployment checks because the test exercises the same config contract as runtime.

5. **Avoid database URL drift across apps.**
   The cluster registry already says credential-bearing `DATABASE_URL` values should be compatibility shims,
   not the source of truth. This package gives Node apps a boring alternative, so the platform does not have
   to hide deterministic connection coordinates in Doppler just to satisfy a library convention.

### Concrete k8cluster proposal

When the cluster repo is ready for a small docs/template PR:

- Add a Node app subsection to `docs/deploying-apps.md` that recommends `pg-from-env` for Node services.
- Optionally add an `Env prefix` column to `docs/connection-registry.md` for app contracts like
  `HANGAR_DB`, `MOOSEGOOSE_DB`, or `SOIL_DB`.
- When Hangar is reserved, add its row to the registry before RobotOverview depends on it.
- In the app template, show non-secret DB coordinates as normal env vars and only the credential as
  `valueFrom.secretKeyRef` / ESO materialized secret.
- Do not add cluster manifests just to adopt this package. The package belongs at the app runtime layer.

## Boundaries / non-use cases

`pg-from-env` should not:

- create databases, roles, schemas, or extensions;
- run migrations;
- talk to Kubernetes, CNPG, Doppler, ESO, Garage, or Argo/Helmfile directly;
- decide which Postgres cluster an app should use;
- store secrets;
- force every app to be Node-based;
- replace the connection registry or deployment docs.

The package is deliberately small. Its job is to make the boring thing consistent once the real source of
truth has already declared what the boring thing is.