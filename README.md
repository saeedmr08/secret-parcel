# SecretParcel

Client-side AES-GCM secret sharing demo by **Saeed Rumaneh**. Encrypt in the browser with Web Crypto; store only ciphertext. The decryption key lives in the URL fragment and is never sent to the server.

## Features

- AES-256-GCM seal / unseal (`lib/parcel.ts`)
- Ciphertext-only store in `data/parcels.json` (the key never leaves the URL fragment)
- One-time open, expiry, attempt limit
- Key conceptualized as `#key=...` fragment

## Scripts

```bash
npm install
npm run dev
npm test
npm run typecheck
```

## Complete product flows

1. Click an example chip (API token, Password, or Wi-Fi note) and **Seal parcel**.
2. Open the share URL once — the AES-GCM key stays in `#key=` and is never posted; the secret is revealed.
3. Open the same URL again — the parcel is spent and the second open fails.

## License

MIT © 2026 Saeed Rumaneh
