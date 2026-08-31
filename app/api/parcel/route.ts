import { NextResponse } from "next/server";
import { canAttempt, createParcelId, type ParcelMeta } from "@/lib/parcel";
import { getParcelStore } from "@/lib/store";

/** Store ciphertext only — never accept a key. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    ciphertext?: string;
    iv?: string;
    ttlMinutes?: number;
    maxAttempts?: number;
  };

  if (!body.ciphertext || !body.iv) {
    return NextResponse.json({ error: "ciphertext and iv required" }, { status: 400 });
  }

  const ttl = Math.min(Math.max(body.ttlMinutes ?? 60, 1), 24 * 60);
  const maxAttempts = Math.min(Math.max(body.maxAttempts ?? 3, 1), 10);
  const id = createParcelId();
  const meta: ParcelMeta = {
    id,
    ciphertext: body.ciphertext,
    iv: body.iv,
    expiresAt: Date.now() + ttl * 60_000,
    maxAttempts,
    attempts: 0,
    opened: false,
  };
  getParcelStore().set(id, meta);

  return NextResponse.json({
    id,
    expiresAt: meta.expiresAt,
    maxAttempts: meta.maxAttempts,
  });
}

/** Fetch ciphertext for client-side decrypt. Increments attempt counter. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const store = getParcelStore();
  const meta = store.get(id);
  if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });

  const blocked = canAttempt(meta);
  if (blocked) {
    return NextResponse.json({ ok: false, reason: blocked.reason }, { status: 403 });
  }

  const next = { ...meta, attempts: meta.attempts + 1 };
  store.set(id, next);

  return NextResponse.json({
    ok: true,
    ciphertext: next.ciphertext,
    iv: next.iv,
    attempts: next.attempts,
    maxAttempts: next.maxAttempts,
    expiresAt: next.expiresAt,
  });
}

/** Mark one-time open after successful client decrypt. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const store = getParcelStore();
  const meta = store.get(body.id);
  if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (meta.opened) {
    return NextResponse.json({ ok: false, reason: "opened" }, { status: 403 });
  }

  store.set(body.id, { ...meta, opened: true });
  return NextResponse.json({ ok: true });
}
