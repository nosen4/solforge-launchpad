// Helpers for /api functions (files starting with "_" are not routes on Vercel).
import { FEE_WALLET_DEFAULT, rpcUrl } from "../shared/promo";

export type Net = "mainnet" | "devnet";

export const netOf = (q: unknown): Net => (q === "devnet" ? "devnet" : "mainnet");

export const serverRpc = (net: Net) =>
  rpcUrl(net === "mainnet" ? process.env.VITE_RPC_MAINNET : process.env.VITE_RPC_DEVNET, net);

export const feeWallet = () => (process.env.VITE_FEE_WALLET || FEE_WALLET_DEFAULT).trim();

export async function rpc<T = any>(net: Net, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(serverRpc(net), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result as T;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isAddress = (s: unknown): s is string => typeof s === "string" && BASE58.test(s);

/** Best DexScreener pair (highest liquidity) per token address. */
export async function dexPairs(addresses: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`);
      const pairs: any[] = await res.json();
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const a = p.baseToken?.address;
        if (!a) continue;
        if (!out.has(a) || (p.liquidity?.usd ?? 0) > (out.get(a).liquidity?.usd ?? 0)) out.set(a, p);
      }
    } catch {
      /* DexScreener down — carry on without market data */
    }
  }
  return out;
}

import { PublicKey } from "@solana/web3.js";
import { Metadata, PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

export interface OnchainMeta {
  name?: string;
  symbol?: string;
  uri?: string;
  image?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

const strip = (s: string) => s.replace(/\0/g, "").trim();
const httpUrl = (s: unknown) => (typeof s === "string" && /^https?:\/\//i.test(s) ? s : undefined);

/** Reads Metaplex metadata for a mint and the off-chain JSON it points to. */
export async function onchainMeta(net: Net, mint: string): Promise<OnchainMeta> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    METADATA_PROGRAM_ID,
  );
  const acc = await rpc<any>(net, "getAccountInfo", [pda.toBase58(), { encoding: "base64" }]);
  if (!acc?.value) return {};
  const [md] = Metadata.deserialize(Buffer.from(acc.value.data[0], "base64"));
  const out: OnchainMeta = { name: strip(md.data.name), symbol: strip(md.data.symbol), uri: strip(md.data.uri) };
  if (httpUrl(out.uri)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const j = await (await fetch(out.uri!, { signal: ctrl.signal })).json();
      clearTimeout(t);
      out.image = httpUrl(j.image);
      out.description = typeof j.description === "string" ? j.description.slice(0, 2000) : undefined;
      const ext = j.extensions || {};
      out.website = httpUrl(j.website) || httpUrl(ext.website);
      out.twitter = httpUrl(j.twitter) || httpUrl(ext.twitter);
      out.telegram = httpUrl(j.telegram) || httpUrl(ext.telegram);
    } catch {
      /* metadata JSON unreachable */
    }
  }
  return out;
}
