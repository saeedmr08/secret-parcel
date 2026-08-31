/**
 * SecretParcel — client-side AES-GCM encrypt/decrypt with Web Crypto.
 * The key is intended to live only in a URL fragment (never sent to the server).
 */

export type ParcelMeta = {
  id: string;
  ciphertext: string;
  iv: string;
  expiresAt: number;
  maxAttempts: number;
  attempts: number;
  opened: boolean;
};

export type SealResult = {
  ciphertext: string;
  iv: string;
  keyBase64url: string;
};

export type OpenStatus =
  | { ok: true; plaintext: string }
  | { ok: false; reason: "expired" | "opened" | "attempts" | "decrypt" };

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is required");
  }
  return globalThis.crypto;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function generateKey(): Promise<CryptoKey> {
  const c = getCrypto();
  return c.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKeyBase64url(key: CryptoKey): Promise<string> {
  const c = getCrypto();
  const raw = new Uint8Array(await c.subtle.exportKey("raw", key));
  return bytesToBase64url(raw);
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function importKeyBase64url(keyBase64url: string): Promise<CryptoKey> {
  const c = getCrypto();
  const raw = base64urlToBytes(keyBase64url);
  return c.subtle.importKey("raw", asBufferSource(raw), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealSecret(plaintext: string): Promise<SealResult> {
  const c = getCrypto();
  const key = await generateKey();
  const iv = c.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await c.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    encoded,
  );
  return {
    ciphertext: bytesToBase64url(new Uint8Array(cipherBuf)),
    iv: bytesToBase64url(iv),
    keyBase64url: await exportKeyBase64url(key),
  };
}

export async function unsealSecret(
  ciphertext: string,
  iv: string,
  keyBase64url: string,
): Promise<string> {
  const c = getCrypto();
  const key = await importKeyBase64url(keyBase64url);
  const plainBuf = await c.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(base64urlToBytes(iv)) },
    key,
    asBufferSource(base64urlToBytes(ciphertext)),
  );
  return new TextDecoder().decode(plainBuf);
}

export function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now >= expiresAt;
}

export type BlockReason = Extract<OpenStatus, { ok: false }>["reason"];

export function canAttempt(
  meta: Pick<ParcelMeta, "opened" | "attempts" | "maxAttempts" | "expiresAt">,
  now = Date.now(),
): Extract<OpenStatus, { ok: false }> | null {
  if (meta.opened) return { ok: false, reason: "opened" };
  if (isExpired(meta.expiresAt, now)) return { ok: false, reason: "expired" };
  if (meta.attempts >= meta.maxAttempts) return { ok: false, reason: "attempts" };
  return null;
}

export async function openParcel(
  meta: ParcelMeta,
  keyBase64url: string,
  now = Date.now(),
): Promise<{ status: OpenStatus; meta: ParcelMeta }> {
  const blocked = canAttempt(meta, now);
  if (blocked) return { status: blocked, meta };

  const next: ParcelMeta = { ...meta, attempts: meta.attempts + 1 };
  try {
    const plaintext = await unsealSecret(meta.ciphertext, meta.iv, keyBase64url);
    return {
      status: { ok: true, plaintext },
      meta: { ...next, opened: true },
    };
  } catch {
    return { status: { ok: false, reason: "decrypt" }, meta: next };
  }
}

export function createParcelId(): string {
  const c = getCrypto();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return bytesToBase64url(bytes);
}
