import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RAW_DIR = path.join(ROOT, "data", "raw");
export const TEXT_DIR = path.join(ROOT, "data", "text");
/**
 * The normalized corpus lives outside `src/`: it feeds SQL generation and must
 * never be bundled into the Worker, which reads from D1.
 */
export const CORPUS_DIR = path.join(ROOT, "data", "corpus");
export const SQL_DIR = path.join(ROOT, "data", "sql");

export const CORPUS_FILE = path.join(CORPUS_DIR, "corpus.json");
export const SCHEMA_FILE = path.join(SQL_DIR, "schema.sql");
export const SEED_FILE = path.join(SQL_DIR, "seed.sql");
export const CHECKSUMS_FILE = path.join(RAW_DIR, "checksums.json");
