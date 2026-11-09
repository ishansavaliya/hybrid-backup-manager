import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export type LicensePayload = {
  v: 1;
  clientId: string;
  clientName: string;
  deviceId: string;
  status: "active" | "blocked";
  expiresAt: string;
  issuedAt: string;
  renewContact: string;
};

// Wire format: base64url(JSON).base64url(Ed25519 signature over the raw JSON bytes of segment 1); no padding.

export function signLicense(p: LicensePayload, privateKeyB64: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const json = Buffer.from(JSON.stringify(p), "utf8");
  const signature = sign(null, json, key);
  return `${json.toString("base64url")}.${signature.toString("base64url")}`;
}

export function verifyLicense(token: string, publicKeyB64: string): LicensePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const json = Buffer.from(parts[0], "base64url");
    const signature = Buffer.from(parts[1], "base64url");
    const key = createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: Buffer.from(publicKeyB64, "base64").toString("base64url"),
      },
      format: "jwk",
    });
    if (!verify(null, json, key, signature)) return null;
    return JSON.parse(json.toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}
