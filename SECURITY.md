# Security notes — SecretParcel

- **Threat model (demo):** Illustrates zero-knowledge-ish sharing where the server never sees the key.
- **Key handling:** Keep the AES key in the URL fragment (`#...`). Fragments are not included in HTTP requests. Do not put keys in query strings or request bodies.
- **Storage:** Ciphertext is held in an in-memory Map (process-local, non-durable). Not suitable for production multi-instance deploy.
- **One-time open:** After a successful decrypt, the parcel is marked opened and further opens fail.
- **Limits:** Expiry and attempt counters reduce brute-force of wrong keys; they are not a substitute for strong keys.
- **Not production crypto product:** No audit, no key escrow, no forward secrecy beyond AES-GCM session keys.
