import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const readinessScript = fs.readFileSync(
  path.join(projectRoot, "scripts/hosted-readiness-check.mjs"),
  "utf8",
);

test("Platform 1 runtime contract targets Node 22 everywhere", () => {
  assert.equal(packageJson.engines.node, "22.x");
  assert.equal(fs.readFileSync(path.join(projectRoot, ".nvmrc"), "utf8").trim(), "22.14.0");
  assert.match(packageJson.devDependencies["@types/node"], /^22\./);
  assert.match(readinessScript, /if \(major === 22\)/);
  assert.match(readinessScript, /expected Node 22\.x/);
});
