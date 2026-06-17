import { execFileSync } from "child_process";
import { resolve } from "path";
import { loadE2EEnv } from "./helpers/env";

// Runs once after the suite: deletes the test user's orders/items/events/outbox + simulator
// webhooks by shelling out to the api cleanup script (service-role + assertSafeTestDb). A cleanup
// failure is reported but does NOT fail the run — the assertions already passed by this point.
async function globalTeardown(): Promise<void> {
  loadE2EEnv();
  const cleanup = resolve(__dirname, "../../api/scripts/cleanup-e2e.js");
  try {
    const out = execFileSync("node", [cleanup], { env: process.env, encoding: "utf8" });
    process.stdout.write(out);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    process.stdout.write(`global-teardown: cleanup error\n${e.stdout ?? ""}\n${e.stderr ?? ""}\n`);
  }
}

export default globalTeardown;
