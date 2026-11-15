// Shared by the browser app and the /api functions. No env access here.

export const FEE_WALLET_DEFAULT = "F2AEeLMDAub2gsZw95jz8UsggHW8j2BUcYYsuvA9EGRq";

export type TierId = "f6" | "f24" | "f72" | "b24";

export interface Tier {
  id: TierId;
  label: string;
  hours: number;
  sol: number;
  banner: boolean; // also shown in the site-wide banner
  perks: string[];
}

export const TIERS: Tier[] = [
  { id: "f6", label: "Featured · 6 hours", hours: 6, sol: 0.1, banner: false, perks: ["Pinned on SolForge Trending", "Listed on the Promote board"] },
  { id: "f24", label: "Featured · 24 hours", hours: 24, sol: 0.3, banner: false, perks: ["Pinned on SolForge Trending", "Listed on the Promote board"] },
  { id: "f72", label: "Featured · 3 days", hours: 72, sol: 0.75, banner: false, perks: ["Pinned on SolForge Trending", "Listed on the Promote board", "Best value"] },
  { id: "b24", label: "Banner + Featured · 24 hours", hours: 24, sol: 0.5, banner: true, perks: ["Rotating banner on every SolForge page", "Pinned on SolForge Trending", "Listed on the Promote board"] },
];

export const tierById = (id: string) => TIERS.find((t) => t.id === id);

/** Max simultaneous banner slots; extra purchases queue behind (sorted by payment time). */
export const MAX_BANNERS = 3;

export interface PromoSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
}

const MEMO_PREFIX = "sf1";
const clean = (s?: string) => (s || "").replace(/[|\s]/g, "").slice(0, 120);

/** Memo written into the payment transaction, e.g. "sf1|<mint>|f24|<web>|<x>|<tg>". */
export function encodeMemo(mint: string, tier: TierId, s: PromoSocials = {}) {
  return [MEMO_PREFIX, mint, tier, clean(s.website), clean(s.twitter), clean(s.telegram)].join("|");
}

export function decodeMemo(raw: string | null | undefined) {
  if (!raw) return null;
  // RPC returns memos like "[42] sf1|..." — possibly several separated by "; "
  for (const part of raw.split(";")) {
    const text = part.trim().replace(/^\[\d+\]\s*/, "");
    const [p, mint, tier, website, twitter, telegram] = text.split("|");
    if (p === MEMO_PREFIX && mint && tierById(tier || "")) {
      return { mint, tier: tier as TierId, socials: { website, twitter, telegram } as PromoSocials };
    }
  }
  return null;
}

export interface ActivePromo {
  mint: string;
  tier: TierId;
  banner: boolean;
  start: number; // unix seconds
  end: number;
  signature: string;
  socials: PromoSocials;
  name?: string;
  symbol?: string;
  icon?: string;
}

export const rpcUrl = (v: string | undefined, cluster: "mainnet" | "devnet") => {
  const s = (v || "").trim();
  if (!s) return cluster === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(s)}`;
};

export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
