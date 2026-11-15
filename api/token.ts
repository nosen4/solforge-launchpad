// GET /api/token?mint=<address>&net=mainnet|devnet
// Everything the public token page needs: on-chain metadata, market data and socials.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dexPairs, isAddress, netOf, onchainMeta, rpc } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const net = netOf(req.query.net);
  const mint = req.query.mint;
  if (!isAddress(mint)) return res.status(400).json({ error: "Invalid token address" });

  try {
    const [meta, supplyRes, pairs] = await Promise.all([
      onchainMeta(net, mint).catch(() => ({}) as Awaited<ReturnType<typeof onchainMeta>>),
      rpc<any>(net, "getTokenSupply", [mint]).catch(() => null),
      net === "mainnet" ? dexPairs([mint]) : Promise.resolve(new Map<string, any>()),
    ]);
    if (!supplyRes) return res.status(404).json({ error: "Token not found on " + net });

    const mintInfo = await rpc<any>(net, "getAccountInfo", [mint, { encoding: "jsonParsed" }]).catch(() => null);
    const info = mintInfo?.value?.data?.parsed?.info ?? {};
    const pair = pairs.get(mint);
    const link = (t: string) =>
      pair?.info?.socials?.find((s: any) => s.type === t)?.url ||
      (t === "website" ? pair?.info?.websites?.[0]?.url : undefined);

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({
      mint,
      net,
      name: meta.name || pair?.baseToken?.name || "Unknown token",
      symbol: meta.symbol || pair?.baseToken?.symbol || "???",
      image: meta.image || pair?.info?.imageUrl || null,
      description: meta.description || "",
      website: meta.website || link("website") || null,
      twitter: meta.twitter || link("twitter") || null,
      telegram: meta.telegram || link("telegram") || null,
      supply: supplyRes.value.uiAmountString,
      decimals: supplyRes.value.decimals,
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
      market: pair
        ? {
            pairAddress: pair.pairAddress,
            dexId: pair.dexId,
            url: pair.url,
            priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
            marketCap: pair.marketCap ?? pair.fdv ?? null,
            liquidityUsd: pair.liquidity?.usd ?? null,
            volume24h: pair.volume?.h24 ?? null,
            change24h: pair.priceChange?.h24 ?? null,
          }
        : null,
    });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || "Failed to load token" });
  }
}
