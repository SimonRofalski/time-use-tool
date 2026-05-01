import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

const RESET_TOKEN_BYTES = 32;
const SECURITY_HASH_KEY_LENGTH = 64;

export function normalizeSecurityAnswer(value: string) {
  return value.trim().toLowerCase();
}

export function hashSecurityAnswer(value: string) {
  const normalized = normalizeSecurityAnswer(value);
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(
    normalized,
    salt,
    SECURITY_HASH_KEY_LENGTH,
  ).toString("hex");

  return `${salt}:${derivedKey}`;
}

export function verifySecurityAnswer(value: string, storedHash: string) {
  const [salt, storedDerivedKey] = storedHash.split(":");
  if (!salt || !storedDerivedKey) {
    return false;
  }

  const normalized = normalizeSecurityAnswer(value);
  const derivedKey = scryptSync(normalized, salt, SECURITY_HASH_KEY_LENGTH);
  const storedBuffer = Buffer.from(storedDerivedKey, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
}

export function createResetChallengeToken() {
  return randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

export function hashResetChallengeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getResetChallengeExpirationDate() {
  const expirationDate = new Date();
  expirationDate.setMinutes(expirationDate.getMinutes() + 15);
  return expirationDate.toISOString();
}
