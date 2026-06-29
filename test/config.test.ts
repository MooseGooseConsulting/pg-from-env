import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readDbConfig, MissingConfigError } from "../src/config.js";
import { createDbPools } from "../src/index.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }
}

function clearEnv(prefix: string) {
  const keys = Object.keys(process.env).filter((k) => k.startsWith(`${prefix}_`));
  for (const k of keys) {
    Reflect.deleteProperty(process.env, k);
  }
}

const baseEnv = {
  HANGAR_DB_HOST: "pg.example.com",
  HANGAR_DB_NAME: "hangar",
  HANGAR_DB_USER: "app",
  HANGAR_DB_PASSWORD: "secret",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("readDbConfig", () => {
  beforeEach(() => {
    setEnv(baseEnv);
  });

  afterEach(() => {
    clearEnv("HANGAR_DB");
  });

  it("reads required fields from environment", () => {
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.host).toBe("pg.example.com");
    expect(config.database).toBe("hangar");
    expect(config.user).toBe("app");
    expect(config.password).toBe("secret");
  });

  it("uses default port 5432 when not set", () => {
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.port).toBe(5432);
  });

  it("reads custom port from environment", () => {
    setEnv({ HANGAR_DB_PORT: "5433" });
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.port).toBe(5433);
  });

  it("throws MissingConfigError for missing HOST", () => {
    Reflect.deleteProperty(process.env, "HANGAR_DB_HOST");
    expect(() => {
      readDbConfig({ prefix: "HANGAR_DB" });
    }).toThrow(MissingConfigError);
    expect(() => {
      readDbConfig({ prefix: "HANGAR_DB" });
    }).toThrow(/HANGAR_DB_HOST/);
  });

  it("throws MissingConfigError for missing NAME", () => {
    Reflect.deleteProperty(process.env, "HANGAR_DB_NAME");
    expect(() => {
      readDbConfig({ prefix: "HANGAR_DB" });
    }).toThrow(/HANGAR_DB_NAME/);
  });

  it("throws MissingConfigError for missing USER", () => {
    Reflect.deleteProperty(process.env, "HANGAR_DB_USER");
    expect(() => {
      readDbConfig({ prefix: "HANGAR_DB" });
    }).toThrow(/HANGAR_DB_USER/);
  });

  it("throws MissingConfigError for missing PASSWORD", () => {
    Reflect.deleteProperty(process.env, "HANGAR_DB_PASSWORD");
    expect(() => {
      readDbConfig({ prefix: "HANGAR_DB" });
    }).toThrow(/HANGAR_DB_PASSWORD/);
  });

  it("overrides env values with overrides parameter", () => {
    const config = readDbConfig({
      prefix: "HANGAR_DB",
      overrides: { host: "override.example.com", port: 9999 },
    });
    expect(config.host).toBe("override.example.com");
    expect(config.port).toBe(9999);
  });

  it("reads pool tuning parameters with defaults", () => {
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.max).toBe(10);
    expect(config.idleTimeoutMillis).toBe(30000);
    expect(config.connectionTimeoutMillis).toBe(2000);
    expect(config.maxLifetimeSeconds).toBe(1800);
  });

  it("reads custom pool tuning from env", () => {
    setEnv({
      HANGAR_DB_POOL_MAX: "20",
      HANGAR_DB_POOL_IDLE_TIMEOUT_MS: "60000",
      HANGAR_DB_POOL_CONNECT_TIMEOUT_MS: "5000",
      HANGAR_DB_POOL_MAX_LIFETIME_SECONDS: "3600",
    });
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.max).toBe(20);
    expect(config.idleTimeoutMillis).toBe(60000);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.maxLifetimeSeconds).toBe(3600);
  });

  it("returns undefined ssl when SSLMODE is not set", () => {
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.ssl).toBeUndefined();
  });

  it("returns undefined ssl when SSLMODE is disable", () => {
    setEnv({ HANGAR_DB_SSLMODE: "disable" });
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.ssl).toBeUndefined();
  });

  it("returns empty ssl object when SSLMODE is set without cert paths (system trust store)", () => {
    setEnv({ HANGAR_DB_SSLMODE: "verify-full" });
    const config = readDbConfig({ prefix: "HANGAR_DB" });
    expect(config.ssl).toEqual({});
  });

  it("works with multiple independent prefixes", () => {
    setEnv({
      AUTH_DB_HOST: "auth.example.com",
      AUTH_DB_NAME: "auth",
      AUTH_DB_USER: "auth_user",
      AUTH_DB_PASSWORD: "auth_secret",
    });

    const hangar = readDbConfig({ prefix: "HANGAR_DB" });
    const auth = readDbConfig({ prefix: "AUTH_DB" });

    expect(hangar.host).toBe("pg.example.com");
    expect(hangar.database).toBe("hangar");
    expect(auth.host).toBe("auth.example.com");
    expect(auth.database).toBe("auth");

    clearEnv("AUTH_DB");
  });

  it("uses readable pool keys for DB-suffixed prefixes", async () => {
    setEnv({
      MARKET_RAW_DB_HOST: "pg.example.com",
      MARKET_RAW_DB_NAME: "market_raw",
      MARKET_RAW_DB_USER: "techdeals",
      MARKET_RAW_DB_PASSWORD: "secret",
      TECHDEALS_WORK_DB_HOST: "pg.example.com",
      TECHDEALS_WORK_DB_NAME: "techdeals_work",
      TECHDEALS_WORK_DB_USER: "techdeals",
      TECHDEALS_WORK_DB_PASSWORD: "secret",
    });

    const pools = createDbPools({
      prefixes: ["MARKET_RAW_DB", "TECHDEALS_WORK_DB"],
    });

    expect(Object.keys(pools).sort()).toEqual(["marketRaw", "techdealsWork"]);

    await Promise.all(Object.values(pools).map(async (pool) => pool.end()));
    clearEnv("MARKET_RAW_DB");
    clearEnv("TECHDEALS_WORK_DB");
  });

  it("handles numeric segments in prefixes (e.g. PG18_DB)", async () => {
    setEnv({
      PG18_DB_HOST: "pg18.example.com",
      PG18_DB_NAME: "postgres",
      PG18_DB_USER: "admin",
      PG18_DB_PASSWORD: "password",
    });

    const pools = createDbPools({
      prefixes: ["PG18_DB"],
    });

    expect(Object.keys(pools)).toEqual(["pg18"]);

    await Promise.all(Object.values(pools).map(async (pool) => pool.end()));
    clearEnv("PG18_DB");
  });

  it("throws before creating pools when derived keys collide", () => {
    expect(() => {
      createDbPools({ prefixes: ["AUTH_DB", "AUTH"] });
    }).toThrow(/Duplicate pool key "auth"/);
  });
});
