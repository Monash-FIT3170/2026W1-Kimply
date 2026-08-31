#!/usr/bin/env node
/**
 * Verify a MongoDB connection string works, without ever printing it.
 *
 * Reads MONGO_URL from an env file and reports what actually matters:
 * can we connect, which database did we land in, can the user read and write,
 * and is the user correctly scoped.
 *
 * The URL is never echoed, so this is safe to run in a shared session. Only the
 * host and database name are shown, never the credentials.
 *
 *   node scripts/check-mongo.mjs [path-to-env-file]
 *
 * Defaults to ./.env, then /opt/kimply/.env.
 *
 * Requires the mongodb driver. If it is not installed, the script says so and
 * exits rather than failing obscurely:
 *   npm install --no-save mongodb
 */

import { readFileSync, existsSync } from "node:fs";

const candidates = [process.argv[2], "./.env", "/opt/kimply/.env"].filter(
  Boolean,
);
const envPath = candidates.find((p) => existsSync(p));

if (!envPath) {
  console.error(`No env file found. Looked in: ${candidates.join(", ")}`);
  process.exit(2);
}

// Minimal .env parse: KEY=VALUE, ignoring comments and blank lines. Deliberately
// does not strip quotes beyond the outermost pair, since a Mongo password can
// legitimately contain almost anything.
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const url = env.MONGO_URL;
if (!url) {
  console.error(`MONGO_URL not set in ${envPath}`);
  process.exit(2);
}

let MongoClient;
try {
  ({ MongoClient } = await import("mongodb"));
} catch {
  console.error(
    'The "mongodb" driver is not installed. Run:  npm install --no-save mongodb',
  );
  process.exit(2);
}

// Redact before anything is printed.
const safe = url.replace(/\/\/[^@]*@/, "//<credentials>@");
const dbFromPath = (url.match(/\/([^/?]+)(\?|$)/) || [])[1];

console.log(`env file : ${envPath}`);
console.log(`target   : ${safe}`);
console.log("");

let fail = 0;
const check = (label, ok, detail = "") => {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " :: " + detail : ""}`,
  );
  if (!ok) fail++;
};

// Fail fast rather than hanging for the driver's 30s default, because the most
// likely failure here is an IP allowlist block, which manifests as a timeout.
//
// Construct inside its own try: an unescaped character in the password throws
// here, before any connection is attempted, and an uncaught stack trace is a
// poor way to report what is really a one-line fix.
let client;
try {
  client = new MongoClient(url, { serverSelectionTimeoutMS: 8000 });
} catch (err) {
  check("parse connection string", false, err.message);
  if (/unescaped characters/i.test(err.message)) {
    console.log("");
    console.log("  The password contains characters that are not URI-safe.");
    console.log(
      "  `openssl rand -base64` is the usual culprit: its alphabet includes / and +.",
    );
    console.log("");
    console.log("  Two options:");
    console.log("    1. Regenerate with a URL-safe alphabet (recommended):");
    console.log("         openssl rand -hex 32");
    console.log("    2. Percent-encode the existing one:");
    console.log("         /  ->  %2F     +  ->  %2B     =  ->  %3D");
    console.log("         @  ->  %40     :  ->  %3A     #  ->  %23");
  }
  console.log("");
  console.log("1 CHECK(S) FAILED");
  process.exit(1);
}

try {
  await client.connect();
  check("connect", true);

  const db = client.db();
  check(
    "database in connection path",
    !!dbFromPath && dbFromPath !== "?",
    dbFromPath || 'MISSING - collections would land in "test"',
  );
  check(
    "resolved database name",
    db.databaseName === "kimply",
    db.databaseName,
  );

  await db.command({ ping: 1 });
  check("ping", true);

  // Prove readWrite actually works, then clean up after ourselves.
  const probe = db.collection("_connectivity_probe");
  const ins = await probe.insertOne({ at: new Date(), by: "check-mongo.mjs" });
  check("write", !!ins.insertedId);
  const found = await probe.findOne({ _id: ins.insertedId });
  check("read back", !!found);
  await probe.deleteOne({ _id: ins.insertedId });
  check("delete", true);

  // Report the roles actually attached, which is far more actionable than a bare
  // pass/fail. connectionStatus is readable by any authenticated user.
  let roles = [];
  try {
    const status = await db.command({ connectionStatus: 1, showPrivileges: false });
    roles = status?.authInfo?.authenticatedUserRoles ?? [];
    console.log("");
    console.log("  roles attached to this user:");
    for (const r of roles) console.log(`    - ${r.role} @ ${r.db}`);
    console.log("");
  } catch {
    /* non-fatal */
  }

  // Want exactly: readWrite scoped to the kimply database.
  const scoped = roles.length > 0 && roles.every((r) => r.db === "kimply");
  const broad = roles.filter((r) => r.db !== "kimply");
  check(
    "scoped to the kimply database only",
    scoped,
    scoped
      ? roles.map((r) => `${r.role}@${r.db}`).join(", ")
      : `also has ${broad.map((r) => `${r.role}@${r.db}`).join(", ")}`,
  );

  // Independent confirmation, checking the RESULT rather than whether the command
  // succeeded.
  //
  // Since MongoDB 4.0.5, listDatabases implicitly applies authorizedDatabases:true
  // for users lacking the cluster-wide listDatabases privilege: the command
  // succeeds but returns only the databases the user can actually see. So success
  // alone means nothing - what matters is what comes back.
  try {
    const res = await client.db("admin").command({ listDatabases: 1 });
    const names = (res.databases ?? []).map((d) => d.name);
    const foreign = names.filter((n) => n !== "kimply");
    check(
      "sees only the kimply database",
      foreign.length === 0,
      foreign.length ? `also sees: ${foreign.join(", ")}` : names.join(", "),
    );
  } catch {
    // Being denied outright is also correct.
    check("sees only the kimply database", true, "listDatabases denied");
  }
} catch (err) {
  const m = err.message || String(err);
  check("connect", false, m.split("\n")[0]);
  if (/timed out|ServerSelection/i.test(m)) {
    console.log("");
    console.log("  Server selection timed out. Most likely the IP allowlist:");
    console.log(
      "  the address you are connecting from is not in Atlas Network Access.",
    );
  }
  if (/Authentication failed|bad auth/i.test(m)) {
    console.log("");
    console.log("  Authentication failed: wrong username or password.");
    console.log(
      "  If the password contains @ : / ? # or &, it must be percent-encoded in the URL.",
    );
  }
} finally {
  await client.close().catch(() => {});
}

console.log("");
console.log(fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
