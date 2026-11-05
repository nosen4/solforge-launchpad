# SolForge — Solana token launcher + Raydium pools

A non-custodial site where users connect a wallet and:

1. **Create Token**: mint an SPL token with Metaplex metadata (name, symbol, image, description, socials) in **one transaction**. Optional add-ons: revoke mint, freeze and update authority.
2. **Raydium Pool**: open a **Raydium CPMM** pool (token / SOL). You pick the fee tier and start time. No OpenBook market needed, and Jupiter routes it automatically.
3. **Manage Liquidity**: load a pool by ID, see your share, remove 1–100%, or **burn LP** to lock liquidity forever.
4. **Trending**: live trending and new Solana tokens from DexScreener. *Use as template* prefills the create form with that coin's description. The user still has to pick a different name and ticker and upload their own image.

Platform fees go to your wallet (`VITE_FEE_WALLET`) as a SOL transfer the user approves. On token creation the fee is part of the same transaction. For pool and liquidity actions it is a separate transaction sent first.

## Stack
Vite + React + TypeScript · `@solana/wallet-adapter` (Phantom, Solflare + any Wallet-Standard wallet) · `@raydium-io/raydium-sdk-v2` (CPMM) · `@metaplex-foundation/mpl-token-metadata` · Vercel serverless functions for IPFS (Pinata) and the trending feed.

```
api/upload.ts      pins image + metadata JSON to IPFS (keeps your Pinata key server-side)
api/trending.ts    DexScreener trending/new Solana tokens, cached 60s
src/lib/token.ts   mint + ATA + mintTo + metadata + revokes + fee, one tx
src/lib/raydium.ts CPMM createPool / withdrawLiquidity / burn LP
src/components/    CreateToken, CreatePool, ManageLiquidity, Trending, Faq
```

## Run locally
```bash
npm install
cp .env.example .env        # fill in RPC, fee wallet, PINATA_JWT
npx vercel dev              # serves the site AND /api functions on :3000
```
`npm run dev` (plain Vite) runs the UI only. `/api` won't exist unless you set `API_PROXY=https://your-deployment.vercel.app`.

## Deploy (Vercel)
1. Push this folder to a GitHub repo and import it in Vercel. It auto-detects Vite.
2. Add the env vars from `.env.example` in Project → Settings → Environment Variables.
3. Deploy.

## Test on devnet first
Switch the header selector to **Devnet**, get SOL from https://faucet.solana.com, then create a token, open a pool, and remove liquidity. Raydium's devnet CPMM program IDs are wired in automatically.

## Notes
- Raydium charges its own one-time pool-creation fee (about 0.15 SOL on mainnet), separate from yours.
- Raydium/DexScreener may take 10–15 minutes to index a new pool.
- Tokens with an active **freeze authority** get flagged by Raydium and scanners, so the toggle is on by default.
- Use a paid RPC on mainnet. The public endpoint will fail under load.
- If you charge fees and market this publicly, add your own Terms of Use and Privacy Policy pages. Rules on token-issuance tooling vary by country.
