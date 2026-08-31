"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { sealSecret, unsealSecret } from "@/lib/parcel";

const EXAMPLES = [
  {
    label: "API token",
    secret: "sk_test_northwind_4f8e2c91a0b7d3e6",
    ttl: 60,
    maxAttempts: 3,
  },
  {
    label: "Password",
    secret: "HarborClinic!2026",
    ttl: 15,
    maxAttempts: 3,
  },
  {
    label: "Wi-Fi note",
    secret: "SSID: Northwind-Guest\nPassword: atlas-pier-1847\nValid until Friday standup.",
    ttl: 120,
    maxAttempts: 2,
  },
] as const;

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("seal");
  const [secret, setSecret] = useState("");
  const [ttl, setTtl] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [shareUrl, setShareUrl] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [openedText, setOpenedText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const fragmentKey = useMemo(() => {
    if (typeof window === "undefined") return "";
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    return params.get("key") ?? "";
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("p");
    if (id) {
      setParcelId(id);
      setMode("open");
    }
  }, []);

  async function onSeal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    setShareUrl("");
    try {
      const sealed = await sealSecret(secret);
      const res = await fetch("/api/parcel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          ttlMinutes: ttl,
          maxAttempts,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "seal failed");
      const url = `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(data.id)}#key=${sealed.keyBase64url}`;
      setShareUrl(url);
      setStatus("Parcel sealed. Share the full URL — the key stays in the fragment.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onOpen(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOpenedText("");
    setStatus("");
    try {
      const key =
        fragmentKey ||
        new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key") ||
        "";
      if (!key) throw new Error("Missing key in URL fragment (#key=...)");
      if (!parcelId) throw new Error("Missing parcel id");

      const res = await fetch(`/api/parcel?id=${encodeURIComponent(parcelId)}`);
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        ciphertext?: string;
        iv?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.ciphertext || !data.iv) {
        throw new Error(data.reason ?? data.error ?? "cannot open");
      }

      const plaintext = await unsealSecret(data.ciphertext, data.iv, key);
      await fetch("/api/parcel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: parcelId }),
      });
      setOpenedText(plaintext);
      setStatus("Opened once. This parcel is now spent.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="brand">SecretParcel</p>
        <h1>Seal a secret. Pass the wax key in the fragment.</h1>
        <p className="lede">
          Ciphertext only on the server. AES-GCM in your browser. One open, then ash.
        </p>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" className={mode === "seal" ? "on" : ""} onClick={() => setMode("seal")}>
          Seal
        </button>
        <button type="button" className={mode === "open" ? "on" : ""} onClick={() => setMode("open")}>
          Open
        </button>
      </div>

      {mode === "seal" ? (
        <form className="panel" onSubmit={onSeal}>
          <label>
            Secret
            <textarea
              required
              rows={5}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="sk_test_northwind_4f8e2c91a0b7d3e6"
            />
          </label>
          <p className="hint">Examples — click to fill:</p>
          <div className="examples">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="chip"
                onClick={() => {
                  setSecret(example.secret);
                  setTtl(example.ttl);
                  setMaxAttempts(example.maxAttempts);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
          <div className="row">
            <label>
              TTL (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              />
            </label>
            <label>
              Max attempts
              <input
                type="number"
                min={1}
                max={10}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
              />
            </label>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Sealing…" : "Seal parcel"}
          </button>
        </form>
      ) : (
        <form className="panel" onSubmit={onOpen}>
          <label>
            Parcel id
            <input value={parcelId} onChange={(e) => setParcelId(e.target.value)} required />
          </label>
          <p className="hint">
            Key is read from the URL hash only — it is never posted to the API.
          </p>
          <button type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open once"}
          </button>
        </form>
      )}

      {status && <p className="status">{status}</p>}
      {shareUrl && (
        <div className="share">
          <p>Share link</p>
          <code>{shareUrl}</code>
        </div>
      )}
      {openedText && (
        <pre className="reveal">{openedText}</pre>
      )}

      <style jsx>{`
        .shell {
          max-width: 720px;
          margin: 0 auto;
          padding: 3.5rem 1.25rem 5rem;
          position: relative;
          z-index: 1;
        }
        .hero {
          margin-bottom: 2rem;
          animation: rise 0.7s ease both;
        }
        .brand {
          font-family: var(--font-fraunces), var(--font-display);
          font-size: clamp(2.4rem, 8vw, 3.6rem);
          font-weight: 600;
          letter-spacing: -0.03em;
          color: var(--wax-hot);
          margin: 0 0 0.75rem;
          line-height: 1;
        }
        h1 {
          font-family: var(--font-fraunces), var(--font-display);
          font-weight: 500;
          font-size: clamp(1.25rem, 3.5vw, 1.65rem);
          line-height: 1.25;
          margin: 0 0 0.75rem;
          max-width: 18ch;
        }
        .lede {
          margin: 0;
          color: var(--mist);
          max-width: 36ch;
          animation: rise 0.9s ease both;
        }
        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .tabs button {
          background: transparent;
          border: 1px solid color-mix(in srgb, var(--wax) 45%, transparent);
          color: var(--paper);
          padding: 0.55rem 1.1rem;
          font: inherit;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .tabs button.on,
        .tabs button:hover {
          background: color-mix(in srgb, var(--wax) 22%, transparent);
          border-color: var(--wax);
        }
        .panel {
          display: grid;
          gap: 1rem;
          padding: 1.25rem 0;
          animation: rise 0.55s ease both;
        }
        label {
          display: grid;
          gap: 0.4rem;
          font-size: 0.85rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--mist);
        }
        textarea,
        input {
          font: inherit;
          text-transform: none;
          letter-spacing: normal;
          color: var(--ink);
          background: var(--paper);
          border: none;
          padding: 0.75rem 0.85rem;
          width: 100%;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        button[type="submit"] {
          justify-self: start;
          background: var(--wax);
          color: var(--ink);
          border: none;
          padding: 0.85rem 1.4rem;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s;
        }
        button[type="submit"]:hover:not(:disabled) {
          background: var(--wax-hot);
          transform: translateY(-1px);
        }
        .examples {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .chip {
          background: transparent;
          border: 1px solid color-mix(in srgb, var(--wax) 45%, transparent);
          color: var(--paper);
          padding: 0.4rem 0.8rem;
          font: inherit;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .chip:hover {
          border-color: var(--wax);
          background: color-mix(in srgb, var(--wax) 18%, transparent);
        }
          color: var(--mist);
          font-size: 0.95rem;
        }
        .share {
          margin-top: 1rem;
          padding: 1rem;
          border-left: 3px solid var(--wax);
          background: color-mix(in srgb, #000 35%, transparent);
          animation: rise 0.4s ease both;
        }
        .share code {
          display: block;
          margin-top: 0.5rem;
          word-break: break-all;
          font-size: 0.8rem;
          color: var(--paper);
        }
        .reveal {
          margin-top: 1rem;
          padding: 1rem;
          background: #06110c;
          border: 1px solid var(--moss);
          white-space: pre-wrap;
          animation: rise 0.45s ease both;
        }
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (max-width: 560px) {
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
