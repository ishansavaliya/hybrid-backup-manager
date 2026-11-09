import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64");

console.log(`LICENSE_SIGNING_PRIVATE_KEY=${priv}`);
console.log(`LICENSE_PUBLIC_KEY=${pub}`);
