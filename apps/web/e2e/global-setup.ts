import { execFileSync } from "child_process";
import { resolve } from "path";
import { loadE2EEnv } from "./helpers/env";

// Runs once before the suite: seeds the deterministic E2E user + its customers row by shelling out
// to the api script (service-role + assertSafeTestDb live there). Resolves the script by path, so
// the cwd does not matter.
async function globalSetup(): Promise<void> {
  loadE2EEnv();
  const seed = resolve(__dirname, "../../api/scripts/seed-test-user.js");
  const out = execFileSync("node", [seed], { env: process.env, encoding: "utf8" });
  process.stdout.write(`global-setup: seeded test user ${out.trim()}\n`);
}

export default globalSetup;
