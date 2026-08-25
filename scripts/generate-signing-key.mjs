import { generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";

const [privatePath, publicPath] = process.argv.slice(2);
if (!privatePath || !publicPath) {
  console.error("usage: node scripts/generate-signing-key.mjs <private-pem-path> <public-pem-path>");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
await writeFile(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
await writeFile(publicPath, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
console.log("generated an Ed25519 evidence-signing key pair");
