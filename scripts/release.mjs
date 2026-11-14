#!/usr/bin/env node
// Sets one version everywhere: every package.json, tauri.conf.json and
// Cargo.toml. Usage: pnpm release 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) {
  console.error(
    "Usage: pnpm release X.Y.Z   (for example: pnpm release 0.2.0)",
  );
  process.exit(1);
}
const current = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const parts = (v) => v.split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
if (!newer(next, current)) {
  console.error(
    `New version ${next} must be higher than the current ${current}.`,
  );
  process.exit(1);
}

const json = [
  "package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "packages/i18n/package.json",
  "packages/shared-types/package.json",
  "packages/ui/package.json",
  "packages/validation/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
];
for (const file of json) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const updated = text.replace(
    /("version":\s*")\d+\.\d+\.\d+(")/,
    `$1${next}$2`,
  );
  if (updated === text) throw new Error(`No version found in ${file}`);
  writeFileSync(path, updated);
}
const cargo = join(root, "apps/desktop/src-tauri/Cargo.toml");
const toml = readFileSync(cargo, "utf8");
const updatedToml = toml.replace(
  /^(version\s*=\s*")\d+\.\d+\.\d+(")/m,
  `$1${next}$2`,
);
if (updatedToml === toml) throw new Error("No version found in Cargo.toml");
writeFileSync(cargo, updatedToml);

console.log(`Version ${current} → ${next} in ${json.length + 1} files.`);
console.log("Next, publish it (this starts the Windows build on GitHub):");
console.log(`  git commit -am "release: v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push origin HEAD v${next}`);
