const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// rpc-websockets CJS requires uuid, but uuid@14 is ESM-only. Vercel Node
// refuses that require(). Drop the nested ESM copy so Node resolves the
// CJS build of uuid@11 from the project root.
function stripEsmUuid() {
  const nestedUuid = path.join(root, "node_modules", "rpc-websockets", "node_modules", "uuid");
  if (!fs.existsSync(nestedUuid)) return;

  const pkgPath = path.join(nestedUuid, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.type === "module") {
    fs.rmSync(nestedUuid, { recursive: true, force: true });
  }
}

// @exponent-labs/jupiter-lend-idl constructs BorshCoder at import but does
// not declare @coral-xyz/anchor. npm then resolves the hoisted 0.28 copy
// from klend-sdk, which cannot read the 0.30+ IDL ("pubkey" vs object
// types) and throws: Cannot use 'in' operator to search for 'vec' in pubkey.
function nestAnchorForJupiterLendIdl() {
  const idlDir = path.join(root, "node_modules", "@exponent-labs", "jupiter-lend-idl");
  if (!fs.existsSync(idlDir)) return;

  const destDir = path.join(idlDir, "node_modules", "@coral-xyz");
  const dest = path.join(destDir, "anchor");
  try {
    const destStat = fs.lstatSync(dest);
    if (destStat.isSymbolicLink()) fs.unlinkSync(dest);
    else fs.rmSync(dest, { recursive: true, force: true });
  } catch {
    // dest does not exist yet
  }

  const candidates = [
    path.join(
      root,
      "node_modules",
      "@exponent-labs",
      "kamino-vault-idl",
      "node_modules",
      "@coral-xyz",
      "anchor"
    ),
    path.join(
      root,
      "node_modules",
      "@exponent-labs",
      "exponent-sdk",
      "node_modules",
      "@coral-xyz",
      "anchor"
    ),
  ];
  const src = candidates.find((candidate) => fs.existsSync(candidate));
  if (!src) return;

  // Symlink the already-installed copy so @noble/hashes and other Anchor
  // deps resolve from that package's original node_modules, not the
  // hoisted hashes@2 which dropped the ./sha256 export.
  fs.mkdirSync(destDir, { recursive: true });
  fs.symlinkSync(path.relative(destDir, src), dest);
}

stripEsmUuid();
nestAnchorForJupiterLendIdl();
