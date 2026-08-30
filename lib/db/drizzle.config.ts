import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

function loadRootEnv() {
  let directory = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const envPath = path.join(directory, ".env");
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const assignment = trimmed.replace(/^export\s+/, "");
        const separator = assignment.indexOf("=");
        if (separator < 1) continue;
        const key = assignment.slice(0, separator).trim();
        let value = assignment.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
      return;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

loadRootEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Copy .env.example to .env and set it to a reachable PostgreSQL database.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
