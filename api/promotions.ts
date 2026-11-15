// GET /api/promotions?net=mainnet|devnet
// Reads payments sent to the fee wallet, keeps the ones carrying a SolForge promo memo and
// a large-enough SOL transfer, and returns the promotions that are currently running.
// No database: the blockchain is the record of who paid for what.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ActivePromo, MAX_BANNERS, decodeMemo, tierById } from "../shared/promo";
import { dexPairs, feeWallet, netOf, onchainMeta, rpc } from "./_lib";

const LOOKBACK_SEC = 10 * 24 * 3600; // stacked purchases can run for days

interface Paid {
  mint: string;
  tier: ReturnType<typeof tierById> & {};
  time: number;
  signature: string;
  socials: ActivePromo["socials"];
}

async function verifiedPayments(net: "mainnet" | "devnet", wallet: string): Promise<Paid[]> {
  const sigs = await rpc<any[]>(net, "getSignaturesForAddress", [wallet, { limit: 1000 }]);
  const now = Date.now() / 1000;
  const candidates = sigs
    .filter((s) => !s.err && s.blockTime && now - s.blockTime < LOOKBACK_SEC)
    .map((s) => ({ s, memo: decodeMemo(s.memo) }))
    .filter((x) => x.memo)
    .slice(0, 150);

  const results = await Promise.all(
    candidates.map(async ({ s, memo }) => {
      const tier = tierById(memo!.tier)!;
      try {
        const tx = await rpc<any>(net, "getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
        ]);
        if (!tx || tx.meta?.err) return null;
        const ixs: any[] = tx.transaction.message.instructions || [];
        const paidLamports = ixs
          .filter((ix) => ix.program === "system" && ix.parsed?.type === "transfer" && ix.parsed.info.destination === wallet)
          .reduce((sum, ix) => sum + Number(ix.parsed.info.lamports || 0), 0);
        if (paidLamports + 1000 < Math.round(tier.sol * 1e9)) return null; // underpaid
        return { mint: memo!.mint, tier, time: s.blockTime as number, signature: s.signature, socials: memo!.socials };
      } catch {
        return null;
      }
    }),
  );
  return (results.filter(Boolean) as Paid[]).sort((a, b) => a.time - b.time);
}

function schedule(paid: Paid[]): ActivePromo[] {
  const out: ActivePromo[] = [];
  const featuredEnd = new Map<string, number>(); // per-mint stacking
  const bannerSlots: number[] = []; // end time of each occupied banner slot

  for (const p of paid) {
    const dur = p.tier.hours * 3600;
    if (p.tier.banner) {
      // Banner: take a free slot, or queue behind the slot that frees up first.
      bannerSlots.sort((a, b) => a - b);
      let start = p.time;
      if (bannerSlots.length >= MAX_BANNERS) {
        start = Math.max(p.time, bannerSlots.shift()!);
      } else {
        while (bannerSlots.length && bannerSlots[0] <= p.time) bannerSlots.shift();
      }
      const end = start + dur;
      bannerSlots.push(end);
      out.push({ mint: p.mint, tier: p.tier.id, banner: true, start, end, signature: p.signature, socials: p.socials });
    } else {
      // Featured: buying again while active extends the time.
      const start = Math.max(p.time, featuredEnd.get(p.mint) ?? 0);
      const end = start + dur;
      featuredEnd.set(p.mint, end);
      out.push({ mint: p.mint, tier: p.tier.id, banner: false, start, end, signature: p.signature, socials: p.socials });
    }
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const net = netOf(req.query.net);
  try {
    const now = Date.now() / 1000;
    const all = schedule(await verifiedPayments(net, feeWallet()));
    const active = all.filter((p) => p.start <= now && p.end > now);
    const queued = all.filter((p) => p.start > now);
    const recent = all.filter((p) => p.end <= now).slice(-12).reverse();

    // Name / symbol / logo: DexScreener first, on-chain metadata as fallback.
    const mints = [...new Set([...active, ...queued, ...recent].map((p) => p.mint))];
    const pairs = await dexPairs(mints);
    const meta = new Map<string, { name?: string; symbol?: string; icon?: string }>();
    await Promise.all(
      mints.map(async (m) => {
        const p = pairs.get(m);
        if (p) return meta.set(m, { name: p.baseToken.name, symbol: p.baseToken.symbol, icon: p.info?.imageUrl });
        try {
          const o = await onchainMeta(net, m);
          meta.set(m, { name: o.name, symbol: o.symbol, icon: o.image });
        } catch {
          meta.set(m, {});
        }
      }),
    );
    const enrich = (p: ActivePromo) => ({ ...p, ...meta.get(p.mint) });

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({
      net,
      wallet: feeWallet(),
      active: active.map(enrich),
      queued: queued.map(enrich),
      recent: recent.map(enrich),
    });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || "Failed to load promotions" });
  }
}
