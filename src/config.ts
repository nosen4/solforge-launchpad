import { PublicKey } from "@solana/web3.js";

export type Network = "mainnet" | "devnet";

const env = import.meta.env;

// Accepts a full RPC URL, or just a bare Helius API key (turned into a Helius URL).
const rpc = (v: string | undefined, cluster: "mainnet" | "devnet", fallback: string) => {
  const s = (v || "").trim();
  if (!s) return fallback;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(s)}`;
};

export const RPC_URLS: Record<Network, string> = {
  // Use a paid RPC (Helius, QuickNode, Triton…) for mainnet — the public one rate-limits hard.
  mainnet: rpc(env.VITE_RPC_MAINNET, "mainnet", "https://api.mainnet-beta.solana.com"),
  devnet: rpc(env.VITE_RPC_DEVNET, "devnet", "https://api.devnet.solana.com"),
};

/** Wallet that receives your platform fees. Leave empty to charge no fee. */
export const FEE_WALLET: PublicKey | null = (() => {
  try {
    return env.VITE_FEE_WALLET ? new PublicKey(env.VITE_FEE_WALLET) : null;
  } catch {
    console.warn("VITE_FEE_WALLET is not a valid address – fees disabled");
    return null;
  }
})();

const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);

/** Platform fees in SOL (charged inside the same transaction, only after wallet approval). */
export const FEES = {
  createToken: num(env.VITE_FEE_CREATE, 0.1),
  revokeMint: num(env.VITE_FEE_REVOKE_MINT, 0.05),
  revokeFreeze: num(env.VITE_FEE_REVOKE_FREEZE, 0.05),
  revokeUpdate: num(env.VITE_FEE_REVOKE_UPDATE, 0.05),
  createPool: num(env.VITE_FEE_POOL, 0.1),
  removeLiquidity: num(env.VITE_FEE_REMOVE, 0.1),
};

export const SITE_NAME = env.VITE_SITE_NAME || "SolForge";

export const explorerTx = (sig: string, net: Network) =>
  `https://solscan.io/tx/${sig}${net === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAddr = (a: string, net: Network) =>
  `https://solscan.io/account/${a}${net === "devnet" ? "?cluster=devnet" : ""}`;
export const raydiumPoolUrl = (poolId: string) =>
  `https://raydium.io/liquidity/increase/?mode=add&pool_id=${poolId}`;
