// Applies db/schema.sql to the Neon database named by DATABASE_URL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local).");
  process.exit(1);
}

const sql = neon(url);
const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

// Split on blank-line-separated statements is unsafe for arbitrary SQL, but our
// schema file only contains simple statements terminated by ";" with no
// semicolons inside strings, so a naive split is safe here.
const statements = schema
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log("Running:", stmt.split("\n")[0].slice(0, 70), "...");
  await sql(stmt);
}

console.log("Migration complete.");
