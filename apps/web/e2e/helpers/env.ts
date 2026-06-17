import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Minimal .env loader (apps/web has no dotenv dependency, and Playwright does not auto-load .env).
// Loads the given file into process.env WITHOUT overriding already-set vars — so CI, which injects
// the real env, always wins over a local file. Tolerates a missing file (CI has no .env.local).
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Loads apps/web/.env.local (NEXT_PUBLIC_* for the auth helper) and apps/api/.env (api script
// config) for LOCAL runs. Idempotent and safe to call from config, setup, teardown, and helpers.
export function loadE2EEnv(): void {
  loadEnvFile(resolve(__dirname, "../../.env.local"));
  loadEnvFile(resolve(__dirname, "../../../api/.env"));
}
