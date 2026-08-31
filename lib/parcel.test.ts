import { describe, expect, it } from "vitest";
import {
  canAttempt,
  createParcelId,
  isExpired,
  openParcel,
  sealSecret,
  unsealSecret,
} from "./parcel";

describe("sealSecret / unsealSecret", () => {
  it("round-trips plaintext with AES-GCM", async () => {
    const sealed = await sealSecret("one-time password: hunter2");
    const plain = await unsealSecret(sealed.ciphertext, sealed.iv, sealed.keyBase64url);
    expect(plain).toBe("one-time password: hunter2");
  });

  it("fails with wrong key", async () => {
    const sealed = await sealSecret("secret");
    const other = await sealSecret("other");
    await expect(
      unsealSecret(sealed.ciphertext, sealed.iv, other.keyBase64url),
    ).rejects.toThrow();
  });
});

describe("expiry and attempts", () => {
  it("detects expiry", () => {
    expect(isExpired(Date.now() - 1)).toBe(true);
    expect(isExpired(Date.now() + 60_000)).toBe(false);
  });

  it("blocks opened, expired, and attempt-limit parcels", () => {
    const base = {
      opened: false,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: Date.now() + 60_000,
    };
    expect(canAttempt({ ...base, opened: true })).toEqual({ ok: false, reason: "opened" });
    expect(canAttempt({ ...base, expiresAt: Date.now() - 1 })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(canAttempt({ ...base, attempts: 3 })).toEqual({ ok: false, reason: "attempts" });
    expect(canAttempt(base)).toBeNull();
  });

  it("openParcel marks one-time open and increments attempts on failure", async () => {
    const sealed = await sealSecret("payload");
    const meta = {
      id: createParcelId(),
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      expiresAt: Date.now() + 60_000,
      maxAttempts: 2,
      attempts: 0,
      opened: false,
    };
    const ok = await openParcel(meta, sealed.keyBase64url);
    expect(ok.status.ok).toBe(true);
    expect(ok.meta.opened).toBe(true);
    expect(ok.meta.attempts).toBe(1);

    const blocked = await openParcel(ok.meta, sealed.keyBase64url);
    expect(blocked.status.ok).toBe(false);
    if (!blocked.status.ok) expect(blocked.status.reason).toBe("opened");

    const bad = await openParcel(meta, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(bad.status.ok).toBe(false);
    if (!bad.status.ok) expect(bad.status.reason).toBe("decrypt");
    expect(bad.meta.attempts).toBe(1);
  });
});
