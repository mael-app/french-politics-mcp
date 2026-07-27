/**
 * Step 1: download source documents into `data/raw/` and compute their SHA-256.
 *
 * Idempotent: a file already present is not downloaded again unless `--force` is
 * passed.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCES } from "./manifest.js";
import { CHECKSUMS_FILE, RAW_DIR } from "./paths.js";

/** Pause between downloads. An online manifesto means dozens of page requests. */
const POLITE_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENT =
  "french-politics-mcp/0.1 (corpus de programmes politiques, usage documentaire)";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  await mkdir(RAW_DIR, { recursive: true });

  const checksums: Record<string, { sha256: string; bytes: number; sourceUrl: string }> = {};

  for (const source of SOURCES) {
    const target = path.join(RAW_DIR, source.fileName);
    let bytes: Buffer;

    if (!force && (await fileExists(target))) {
      bytes = await readFile(target);
      console.log(`skip ${source.id}: already present (${bytes.length} bytes)`);
    } else {
      console.log(`get  ${source.id}: ${source.sourceUrl}`);
      const response = await fetch(source.sourceUrl, {
        headers: {
          "user-agent": USER_AGENT,
          accept: source.format === "pdf" ? "application/pdf,*/*" : "text/html,*/*",
        },
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error(`${source.id}: HTTP ${response.status} on ${source.sourceUrl}`);
      }
      bytes = Buffer.from(await response.arrayBuffer());
      if (source.format === "pdf" && !bytes.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
        throw new Error(
          `${source.id}: response is not a PDF (starts with ${bytes.subarray(0, 16).toString("latin1")})`,
        );
      }
      // A manifesto page is always several kilobytes; below that it is an error
      // page or a JavaScript shell.
      if (source.format === "html" && bytes.length < 2048) {
        throw new Error(`${source.id}: suspicious HTML response (${bytes.length} bytes)`);
      }
      await writeFile(target, bytes);
      console.log(`     ${target} (${bytes.length} bytes)`);
      await sleep(POLITE_DELAY_MS);
    }

    checksums[source.id] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      sourceUrl: source.sourceUrl,
    };
  }

  await writeFile(CHECKSUMS_FILE, `${JSON.stringify(checksums, null, 2)}\n`);
  console.log(`\n${SOURCES.length} sources ready, checksums written to ${CHECKSUMS_FILE}`);
}

await main();
