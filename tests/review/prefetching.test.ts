import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const sourceRoots = [path.join(projectRoot, "src"), path.join(projectRoot, "tests")];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  });
}

test("PREFETCH-001 keeps navigation on framework-managed Link defaults", () => {
  const source = sourceRoots
    .flatMap(sourceFiles)
    .filter((filePath) => /\.(tsx?|jsx?)$/.test(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /prefetch\s*=\s*\{\s*(?:false|true)\s*\}/);
  assert.doesNotMatch(source, /router\.prefetch\s*\(/);
});

test("PREFETCH-002 enables Partial Prefetching with Cache Components", () => {
  const config = fs.readFileSync(path.join(projectRoot, "next.config.ts"), "utf8");
  assert.match(config, /cacheComponents:\s*true/);
  assert.match(config, /partialPrefetching:\s*true/);
});

test("PREFETCH-003 keeps URL-specific runtime prefetch opt-in", () => {
  const source = sourceRoots
    .flatMap(sourceFiles)
    .filter((filePath) => /\.(tsx?|jsx?)$/.test(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /prefetch\s*=\s*\{\s*true\s*\}/);
});
