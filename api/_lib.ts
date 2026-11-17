// Helpers for /api functions (files starting with "_" are not routes on Vercel).
import { FEE_WALLET_DEFAULT, rpcUrl } from "../shared/promo.js";

export type Net = "mainnet" | "devnet";

export const netOf = (q: unknown): Net => (q === "devnet" ? "devnet" : "mainnet");

export const serverRpc = (net: Net) =>
  rpcUrl(net === "mainnet" ? process.env.VITE_RPC_MAINNET : process.env.VITE_RPC_DEVNET, net);

export const feeWallet = () => (process.env.VITE_FEE_WALLET || FEE_WALLET_DEFAULT).trim();

// Backups, tried in order when your RPC refuses. (Solana's own public RPC blocks browsers but
// accepts server requests; PublicNode is the other way round for some hosts — so try both.)
const BACKUP_RPCS: Record<Net, string[]> = {
  mainnet: ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"],
  devnet: ["https://api.devnet.solana.com"],
};

async function call(url: string, method: string, params: unknown[]) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await r.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`RPC ${r.status}: ${text.slice(0, 80)}`);
  }
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}

/** Calls your configured RPC; if it refuses (quota, rate limit, outage) tries the backups in turn. */
export async function rpc<T = any>(net: Net, method: string, params: unknown[]): Promise<T> {
  const urls = [serverRpc(net), ...BACKUP_RPCS[net].filter((u) => u !== serverRpc(net))];
  let last: unknown;
  for (const url of urls) {
    try {
      return (await call(url, method, params)) as T;
    } catch (e) {
      last = e;
      console.warn(`[rpc] ${method} failed on ${url.split("?")[0]}:`, (e as Error).message);
    }
  }
  throw last;
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

// No @solana/web3.js here: it pulls in a websocket package that can't load in Vercel functions.
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
function b58encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) + BigInt(x);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const x of b) {
    if (x !== 0) break;
    out = "1" + out;
  }
  return out;
}
const onCurve = (b: Uint8Array) => {
  try {
    ed25519.ExtendedPoint.fromHex(b);
    return true;
  } catch {
    return false;
  }
};
/** Same algorithm as PublicKey.findProgramAddressSync. */
export function findPda(seeds: Uint8Array[], programId: string): string {
  const prog = b58decode(programId);
  const tag = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), prog, tag];
    const buf = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const h = sha256(buf);
    if (!onCurve(h)) return b58encode(h);
  }
  throw new Error("No PDA found");
}

const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

/** Minimal Metaplex metadata parser: key, update authority, mint, then borsh strings name/symbol/uri. */
function parseMetadata(buf: Buffer) {
  let o = 1 + 32 + 32;
  const str = () => {
    const len = buf.readUInt32LE(o);
    o += 4;
    const v = buf.subarray(o, o + len).toString("utf8");
    o += len;
    return v;
  };
  return { name: str(), symbol: str(), uri: str() };
}

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
  const pda = findPda([new TextEncoder().encode("metadata"), b58decode(METADATA_PROGRAM_ID), b58decode(mint)], METADATA_PROGRAM_ID);
  const acc = await rpc<any>(net, "getAccountInfo", [pda, { encoding: "base64" }]);
  if (!acc?.value) return {};
  const md = parseMetadata(Buffer.from(acc.value.data[0], "base64"));
  const out: OnchainMeta = { name: strip(md.name), symbol: strip(md.symbol), uri: strip(md.uri) };
  if (httpUrl(out.uri)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
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
