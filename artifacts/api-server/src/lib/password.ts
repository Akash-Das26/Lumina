import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Hash a password with scrypt. Returns "scrypt:<salt-hex>:<hash-hex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verify a password against a stored "scrypt:<salt>:<hash>" string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const storedHash = Buffer.from(hashHex, "hex");
  const candidate = await scrypt(password, Buffer.from(saltHex, "hex"), storedHash.length);
  return candidate.length === storedHash.length && timingSafeEqual(candidate, storedHash);
}
