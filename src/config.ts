import { readFileSync } from "node:fs";

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    ca?: string;
    key?: string;
    cert?: string;
  };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  maxLifetimeSeconds: number;
}

export interface CreatePoolOptions {
  /** The environment variable prefix. e.g. "HANGAR_DB" reads HANGAR_DB_HOST, etc. */
  prefix: string;

  /** Override any config values. Takes precedence over env vars. */
  overrides?: Partial<DbConfig>;
}

export interface CreatePoolsOptions {
  prefixes: string[];
  overrides?: Partial<DbConfig>;
}

export class MissingConfigError extends Error {
  constructor(prefix: string, key: string) {
    super(`${prefix}_${key} is required. Set it in your environment or pass it as an override.`);
    this.name = "MissingConfigError";
  }
}

export class InvalidConfigError extends Error {
  constructor(prefix: string, key: string, value: string) {
    super(`${prefix}_${key} must be a valid number. Received: ${JSON.stringify(value)}.`);
    this.name = "InvalidConfigError";
  }
}

function env(prefix: string, key: string): string | undefined {
  return process.env[`${prefix}_${key}`];
}

function requiredEnv(prefix: string, key: string): string {
  const value = env(prefix, key);
  if (value === undefined || value === "") {
    throw new MissingConfigError(prefix, key);
  }
  return value;
}

function parseNumber(prefix: string, key: string, fallback: string): number {
  const raw = env(prefix, key) ?? fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new InvalidConfigError(prefix, key, raw);
  }
  return parsed;
}

function loadSslConfig(prefix: string): DbConfig["ssl"] | undefined {
  const sslmode = env(prefix, "SSLMODE");
  if (!sslmode || sslmode === "disable") return undefined;

  const caPath = env(prefix, "CA_PATH");
  const keyPath = env(prefix, "KEY_PATH");
  const certPath = env(prefix, "CERT_PATH");

  // If SSL is requested but no custom cert paths are provided, use Node's
  // default TLS behavior (system trust store / servername verification).
  if (!caPath && !keyPath && !certPath) return {};

  return {
    ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}),
    ...(keyPath ? { key: readFileSync(keyPath, "utf8") } : {}),
    ...(certPath ? { cert: readFileSync(certPath, "utf8") } : {}),
  };
}

/**
 * Read database configuration from environment variables using a prefix.
 *
 * Env contract (example for prefix "HANGAR_DB"):
 *   HANGAR_DB_HOST - required, PostgreSQL host
 *   HANGAR_DB_PORT - optional, defaults to 5432
 *   HANGAR_DB_NAME - required, database name
 *   HANGAR_DB_USER - required, database user
 *   HANGAR_DB_PASSWORD - required, database password
 *   HANGAR_DB_SSLMODE - optional, set to "disable" to skip SSL
 *   HANGAR_DB_CA_PATH - optional, path to CA certificate file
 *   HANGAR_DB_KEY_PATH - optional, path to client key file (mTLS)
 *   HANGAR_DB_CERT_PATH - optional, path to client certificate file (mTLS)
 *   HANGAR_DB_POOL_MAX - optional, default 10
 *   HANGAR_DB_POOL_IDLE_TIMEOUT_MS - optional, default 30000
 *   HANGAR_DB_POOL_CONNECT_TIMEOUT_MS - optional, default 2000
 *   HANGAR_DB_POOL_MAX_LIFETIME_SECONDS - optional, default 1800
 */
export function readDbConfig(options: CreatePoolOptions): DbConfig {
  const { prefix, overrides } = options;

  const config: DbConfig = {
    host: requiredEnv(prefix, "HOST"),
    port: parseNumber(prefix, "PORT", "5432"),
    database: requiredEnv(prefix, "NAME"),
    user: requiredEnv(prefix, "USER"),
    password: requiredEnv(prefix, "PASSWORD"),
    ssl: loadSslConfig(prefix),
    max: parseNumber(prefix, "POOL_MAX", "10"),
    idleTimeoutMillis: parseNumber(prefix, "POOL_IDLE_TIMEOUT_MS", "30000"),
    connectionTimeoutMillis: parseNumber(prefix, "POOL_CONNECT_TIMEOUT_MS", "2000"),
    maxLifetimeSeconds: parseNumber(prefix, "POOL_MAX_LIFETIME_SECONDS", "1800"),
  };

  return { ...config, ...overrides };
}
