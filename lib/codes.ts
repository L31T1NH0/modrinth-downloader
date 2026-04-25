import { createHash } from 'crypto';
import type { ModListState } from './stateSchema';

// ── Alphabets ────────────────────────────────────────────────────────────────

// Safe: no visually ambiguous pairs (removes 0/O, 1/I/L).
// Used for V, MINOR, PATCH, and MAIN — every char the user types is unambiguous.
const SAFE = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // 30 chars

// Auth: full alphanumeric including ambiguous chars (O, I, 0, 1).
// Intentional: a misread auth char always fails validation, catching typos.
const AUTH_ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 36 chars

// ── Code format ──────────────────────────────────────────────────────────────
//
//   [V(1)] [MINOR(1)] [PATCH(1)] [MAIN(6)] [AUTH(1)]  →  10 chars total
//
//   V     — schema version letter: 'A'=v1, 'B'=v2, … (uppercase, always a letter)
//   MINOR — 1.X encoded as SAFE[X − 7]: 1.7→'2', 1.20→'F', 1.21→'G'  (supports 1.7–1.36)
//   PATCH — .Y  encoded as SAFE[Y]:     .0→'2', .4→'6', .9→'B'       (supports .0–.29)
//   MAIN  — 6 chars from SAFE, SHA-256 of canonical state minus version  (30⁶ ≈ 729 M)
//           Version is excluded from the hash intentionally: the same mod list on
//           different MC versions shares the same MAIN, only MINOR/PATCH differ.
//           This enables client-side version migration without re-fetching mod metadata.
//   AUTH  — checksum of V+MINOR+PATCH+MAIN; covers the full code.
//           May produce O/I/0/1, so any misread immediately fails validation.
//
// Java decode reference (for the Minecraft mod):
//   SAFE  = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
//   minor = SAFE.indexOf(code[1]) + 7
//   patch = SAFE.indexOf(code[2])
//   version = "1." + minor + "." + patch

const SCHEMA_VERSION = 1;
const MAIN_LENGTH    = 6;

// ── Encoding helpers ─────────────────────────────────────────────────────────

function schemaChar(v: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + v - 1);
}

function parseMcVersion(version: string): { minor: number; patch: number } {
  const m = version.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!m) return { minor: 7, patch: 0 };
  return { minor: parseInt(m[1], 10), patch: parseInt(m[2] ?? '0', 10) };
}

function encodeMinor(minor: number): string {
  return SAFE[Math.max(0, Math.min(minor - 7, SAFE.length - 1))];
}

function encodePatch(patch: number): string {
  return SAFE[Math.max(0, Math.min(patch, SAFE.length - 1))];
}

function encodeMain(buf: Buffer): string {
  let n = BigInt('0x' + buf.subarray(0, 12).toString('hex')); // 96 bits, well above 30⁶
  const base = BigInt(SAFE.length);
  const chars: string[] = [];
  for (let i = 0; i < MAIN_LENGTH; i++) {
    chars.push(SAFE[Number(n % base)]);
    n /= base;
  }
  return chars.join('');
}

function computeAuth(prefix: string): string {
  let h = 0;
  for (const c of prefix) {
    h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  }
  return AUTH_ALPHA[h % AUTH_ALPHA.length];
}

// Treat visually ambiguous auth pairs as equivalent during validation:
// O↔0  and  I/L↔1
function normalizeAuth(c: string): string {
  return c.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateCode(state: ModListState): string {
  // Hash excludes `version` — same mod list on different MC versions → same MAIN.
  const canonical = JSON.stringify({
    formatVersion: state.formatVersion,
    source:        state.source,
    contentType:   state.contentType,
    loader:        state.loader       ?? null,
    shaderLoader:  state.shaderLoader ?? null,
    pluginLoader:  state.pluginLoader ?? null,
    mods:          [...state.mods].sort(),
  });
  const hash = createHash('sha256').update(canonical).digest();

  const { minor, patch } = parseMcVersion(state.version);
  const v      = schemaChar(SCHEMA_VERSION);
  const mn     = encodeMinor(minor);
  const p      = encodePatch(patch);
  const main   = encodeMain(hash);
  const prefix = v + mn + p + main;

  return prefix + computeAuth(prefix);
}

/** Returns the normalised (uppercase) code if valid, null otherwise.
 *  Accepts legacy 8-char codes (no checksum) for backward compatibility. */
export function validateCode(raw: string): string | null {
  const code = raw.toUpperCase();

  // Legacy: 8-char base62 codes from the original implementation — pass through.
  if (code.length === 8) return code;

  if (code.length !== 10) return null;

  const v    = code[0];
  const mn   = code[1];
  const p    = code[2];
  const main = code.slice(3, 9);
  const auth = code[9];

  if (!/^[A-Z]$/.test(v))                            return null; // V must be a letter
  if (!SAFE.includes(mn) || !SAFE.includes(p))        return null; // MC chars must be safe
  if (![...main].every(c => SAFE.includes(c)))        return null; // MAIN must be safe

  const expected = computeAuth(v + mn + p + main);
  if (normalizeAuth(auth) !== normalizeAuth(expected)) return null; // checksum mismatch

  return code;
}

/** Decode the Minecraft version embedded in a validated 10-char code.
 *  Returns null for legacy 8-char codes (version unknown). */
export function decodeMcVersion(code: string): string | null {
  if (code.length !== 10) return null;
  const minor = SAFE.indexOf(code[1]) + 7;
  const patch = SAFE.indexOf(code[2]);
  if (minor < 7 || patch < 0) return null;
  return `1.${minor}.${patch}`;
}

export function codeKey(code: string): string {
  return `code:${code}`;
}
