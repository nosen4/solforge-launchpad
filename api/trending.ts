// Vercel serverless function: trending / new Solana tokens from DexScreener's public API.
// GET /api/trending?tab=trending|new
import type { VercelRequest, VercelResponse } from "@vercel/node";

interface Profile {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
  links?: { type?: string; label?: string; url: string }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const tab = req.query.tab === "new" ? "new" : "trending";
  const src =
    tab === "new"
      ? "https://api.dexscreener.com/token-profiles/latest/v1"
      : "https://api.dexscreener.com/token-boosts/top/v1";
  try {
    const list: Profile[] = await (await fetch(src)).json();
    const sol = list.filter((p) => p.chainId === "solana");
    const seen = new Set<string>();
    const uniq = sol.filter((p) => !seen.has(p.tokenAddress) && seen.add(p.tokenAddress)).slice(0, 30);

    // Enrich with name / symbol / market data (max 30 addresses per call)
    const addrs = uniq.map((p) => p.tokenAddress).join(",");
    const pairs: any[] = addrs
      ? await (await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addrs}`)).json()
      : [];
    const best = new Map<string, any>();
    for (const p of pairs) {
      const a = p.baseToken?.address;
      if (!a) continue;
      if (!best.has(a) || (p.liquidity?.usd ?? 0) > (best.get(a).liquidity?.usd ?? 0)) best.set(a, p);
    }

    const tokens = uniq
      .map((p) => {
        const pair = best.get(p.tokenAddress);
        if (!pair) return null;
        const link = (t: string) =>
          p.links?.find((l) => l.type === t || l.label?.toLowerCase() === t)?.url;
        return {
          address: p.tokenAddress,
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          icon: p.icon || pair.info?.imageUrl,
          description: p.description || "",
          marketCap: pair.marketCap ?? pair.fdv ?? null,
          change24h: pair.priceChange?.h24 ?? null,
          volume24h: pair.volume?.h24 ?? null,
          url: pair.url,
          website: link("website"),
          twitter: link("twitter"),
          telegram: link("telegram"),
        };
      })
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({ tab, tokens });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || "Failed to load trending tokens" });
  }
}
