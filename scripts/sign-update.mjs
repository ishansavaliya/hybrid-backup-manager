#!/usr/bin/env node
// Writes latest.json for the updater: version, download URL, SHA-256, size
// and an Ed25519 signature over all of them.
// Usage: BAKVION_UPDATE_SIGNING_KEY=<base64 pkcs8> node scripts/sign-update.mjs \
//   --installer <file> --version 0.2.0 --url <https download url> --out latest.json
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`--${name} is required`);
  return process.argv[i + 1];
};
const installer = arg("installer");
const version = arg("version");
const url = arg("url");
const out = arg("out");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("version must be X.Y.Z");
if (!url.startsWith("https://")) throw new Error("url must be https");
const secret = process.env.BAKVION_UPDATE_SIGNING_KEY;
if (!secret) throw new Error("BAKVION_UPDATE_SIGNING_KEY is not set");

const bytes = readFileSync(installer);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const size = statSync(installer).size;
// Must match update.message() in the agent.
const message = `bakvion-update-v1\n${version}\n${url}\n${sha256}\n${size}`;
const key = createPrivateKey({
  key: Buffer.from(secret.trim(), "base64"),
  format: "der",
  type: "pkcs8",
});
const signature = sign(null, Buffer.from(message), key).toString("base64");
writeFileSync(
  out,
  JSON.stringify({ version, url, sha256, size, signature }, null, 2) + "\n",
);
console.log(`Signed ${version}: ${sha256} (${size} bytes)`);
