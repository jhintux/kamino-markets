const fs = require("fs");
const path = require("path");

// rpc-websockets CJS requires uuid, but uuid@14 is ESM-only. Vercel Node
// refuses that require(). Drop the nested ESM copy so Node resolves the
// CJS build of uuid@11 from the project root.
const nestedUuid = path.join(
  __dirname,
  "..",
  "node_modules",
  "rpc-websockets",
  "node_modules",
  "uuid"
);

if (!fs.existsSync(nestedUuid)) process.exit(0);

const pkgPath = path.join(nestedUuid, "package.json");
if (!fs.existsSync(pkgPath)) process.exit(0);

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.type === "module") {
  fs.rmSync(nestedUuid, { recursive: true, force: true });
}
