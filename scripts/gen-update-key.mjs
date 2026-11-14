#!/usr/bin/env node
// Creates the Ed25519 key that signs Bakvion updates.
// The private key goes to a private file (never printed); paste its content
// into the GitHub secret BAKVION_UPDATE_SIGNING_KEY. The public key is printed
// for services/agent/internal/update/update.go (PublicKeyBase64).
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".bakvion");
const file = join(dir, "update-signing-key.txt");
if (existsSync(file)) {
  console.error(
    `Refusing to overwrite ${file}. Delete it first if you really want a new key.`,
  );
  process.exit(1);
}
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(
  file,
  privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") + "\n",
  { mode: 0o600, flag: "wx" },
);
const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
console.log(`Private key saved to ${file} (keep it secret; back it up).`);
console.log(`Public key: ${raw.toString("base64")}`);
