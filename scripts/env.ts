import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Minimal .env.local reader shared by the standalone scripts. Next.js loads
// .env.local itself for the app, but `tsx scripts/*.ts` runs outside that, so
// seed and embed both need this. Not worth a dotenv dependency for the handful
// of KEY=value lines this project uses.
//
// Resolved from the working directory rather than from import.meta.url, which
// isn't available under the CJS output tsx defaults to here.
export function loadDotEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // Real environment variables win over the file, so a one-off
    // `SUPABASE_URL=... npm run embed` still overrides.
    if (!(key in process.env)) process.env[key] = value;
  }
}
