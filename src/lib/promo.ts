import { useEffect, useState } from "react";
import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { FEE_WALLET, Network } from "../config";
import {
  ActivePromo,
  FEE_WALLET_DEFAULT,
  MEMO_PROGRAM_ID,
  PromoSocials,
  TierId,
  encodeMemo,
  tierById,
} from "../../shared/promo";

export const PROMO_WALLET = FEE_WALLET ?? new PublicKey(FEE_WALLET_DEFAULT);

/** One transaction: SOL payment to the promo wallet + a memo saying which token and package it is for. */
export async function payForPromotion(
  connection: Connection,
  wallet: WalletContextState,
  mint: string,
  tierId: TierId,
  socials: PromoSocials,
) {
  const owner = wallet.publicKey;
  if (!owner || !wallet.sendTransaction) throw new Error("Connect a wallet first");
  const tier = tierById(tierId);
  if (!tier) throw new Error("Unknown package");
  new PublicKey(mint); // throws if invalid

  const memo = encodeMemo(mint, tierId, socials);
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: PROMO_WALLET,
      lamports: Math.round(tier.sol * LAMPORTS_PER_SOL),
    }),
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    }),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

export interface PromoFeed {
  active: ActivePromo[];
  queued: ActivePromo[];
  recent: ActivePromo[];
}

const cache: Partial<Record<Network, { at: number; data: PromoFeed }>> = {};

export function usePromotions(net: Network, refreshKey = 0) {
  const [data, setData] = useState<PromoFeed | null>(cache[net]?.data ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    let dead = false;
    const c = cache[net];
    if (c && Date.now() - c.at < 20_000 && !refreshKey) {
      setData(c.data);
      return;
    }
    fetch(`/api/promotions?net=${net}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (d.error) throw new Error(d.error);
        cache[net] = { at: Date.now(), data: d };
        setData(d);
        setError("");
      })
      .catch((e) => !dead && setError(e.message || "Couldn't load promotions"));
    return () => {
      dead = true;
    };
  }, [net, refreshKey]);
  return { data, error };
}

export function timeLeft(end: number) {
  const s = Math.max(0, end - Date.now() / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h ? `${h}h ${m}m left` : `${m}m left`;
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  supply: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  market: null | {
    pairAddress: string;
    dexId: string;
    url: string;
    priceUsd: number | null;
    marketCap: number | null;
    liquidityUsd: number | null;
    volume24h: number | null;
    change24h: number | null;
  };
}

export async function fetchToken(mint: string, net: Network): Promise<TokenInfo> {
  const r = await fetch(`/api/token?mint=${encodeURIComponent(mint)}&net=${net}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Token not found");
  return d;
}

export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(2)}M`
        : n >= 1e3
          ? `$${(n / 1e3).toFixed(1)}K`
          : n >= 1
            ? `$${n.toFixed(2)}`
            : `$${n.toPrecision(3)}`;
