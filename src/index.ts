import { Pool } from "pg";
import {
  readDbConfig,
  type CreatePoolOptions,
  type CreatePoolsOptions,
  type DbConfig,
} from "./config.js";

export type { DbConfig, CreatePoolOptions, CreatePoolsOptions };
export { MissingConfigError, InvalidConfigError } from "./config.js";

/**
 * Create a pg.Pool from environment variables using a named prefix.
 *
 * @example
 * ```ts
 * import { createDbPool } from "pg-from-env";
 *
 * const hangar = createDbPool({ prefix: "HANGAR_DB" });
 * const auth   = createDbPool({ prefix: "AUTH_DB" });
 * ```
 */
export function createDbPool(options: CreatePoolOptions): Pool {
  const c = readDbConfig(options);
  const { overrides } = options;

  return new Pool({
    host: overrides?.host ?? c.host,
    port: overrides?.port ?? c.port,
    database: overrides?.database ?? c.database,
    user: overrides?.user ?? c.user,
    password: overrides?.password ?? c.password,
    ssl: overrides?.ssl ?? c.ssl,
    max: overrides?.max ?? c.max,
    idleTimeoutMillis: overrides?.idleTimeoutMillis ?? c.idleTimeoutMillis,
    connectionTimeoutMillis:
      overrides?.connectionTimeoutMillis ?? c.connectionTimeoutMillis,
    maxLifetimeSeconds:
      overrides?.maxLifetimeSeconds ?? c.maxLifetimeSeconds,
  });
}

/**
 * Create multiple pg.Pool instances at once.
 *
 * @example
 * ```ts
 * import { createDbPools } from "pg-from-env";
 *
 * const { hangar, auth, analytics } = createDbPools({
 *   prefixes: ["HANGAR_DB", "AUTH_DB", "ANALYTICS_DB"],
 * });
 * ```
 */
export function createDbPools(
  options: CreatePoolsOptions,
): Record<string, Pool> {
  const pools: Record<string, Pool> = {};
  for (const prefix of options.prefixes) {
    // Use the last segment of the prefix as the key (e.g. "HANGAR_DB" → "hangarDb")
    const key = prefix
      .toLowerCase()
      .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    pools[key] = createDbPool({ prefix, overrides: options.overrides });
  }
  return pools;
}
