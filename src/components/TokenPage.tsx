import { useEffect, useState } from "react";
import { useNetwork, go } from "../App";
import { explorerAddr } from "../config";
import { TokenInfo, fetchToken, usd, usePromotions } from "../lib/promo";
import { Copy } from "./ui";

export default function TokenPage({ mint }: { mint: string }) {
  const { net: selectedNet } = useNetwork();
  // Shared links can be opened by anyone: show the token on whichever network it actually exists.
  const [net, setTokenNet] = useState(selectedNet);
  const [t, setT] = useState<TokenInfo | null>(null);
  const [error, setError] = useState("");
  const { data: promos } = usePromotions(net);
  const featured = promos?.active.some((p) => p.mint === mint);

  useEffect(() => {
    let dead = false;
    setT(null);
    setError("");
    const other = selectedNet === "mainnet" ? "devnet" : "mainnet";
    fetchToken(mint, selectedNet)
      .then((d) => [d, selectedNet] as const)
      .catch(() => fetchToken(mint, other).then((d) => [d, other] as const))
      .then(([d, n]) => {
        if (dead) return;
        setTokenNet(n);
        setT(d);
      })
      .catch(() => !dead && setError("This token wasn't found on Solana mainnet or devnet"));
    return () => {
      dead = true;
    };
  }, [mint, selectedNet]);

  useEffect(() => {
    if (t) document.title = `${t.name} ($${t.symbol}) · SolForge`;
    return () => {
      document.title = "SolForge — Launch Solana tokens & Raydium pools";
    };
  }, [t]);

  if (error)
    return (
      <section className="card hero-card" style={{ marginTop: 48 }}>
        <h2>Token not found</h2>
        <p className="muted">{error}. Check the address and try again.</p>
      </section>
    );
  if (!t) return <section className="card hero-card skel" style={{ marginTop: 48, height: 420 }} />;

  const m = t.market;
  const share = typeof window !== "undefined" ? window.location.href : "";
  const shareText = encodeURIComponent(`$${t.symbol} on Solana`);

  return (
    <div className="tpage">
      <section className="tp-head">
        {t.image ? <img src={t.image} alt="" className="tp-logo" /> : <div className="ph tp-logo">{t.symbol.slice(0, 2)}</div>}
        <div className="tp-title">
          <h1>
            {t.name} <span className="mono muted">${t.symbol}</span>
          </h1>
          <div className="row tight">
            <Copy text={t.mint} />
            {featured && <span className="badge">★ Featured</span>}
            {net === "devnet" && <span className="badge warn">Devnet</span>}
          </div>
        </div>
        {m && (
          <div className="tp-price">
            <b>{usd(m.priceUsd)}</b>
            {m.change24h != null && (
              <span className={`chg ${m.change24h >= 0 ? "up" : "down"}`}>
                {m.change24h >= 0 ? "+" : ""}
                {m.change24h.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </section>

      <div className="row">
        <a className="btn primary" href={`https://jup.ag/swap/SOL-${t.mint}`} target="_blank" rel="noreferrer">Buy on Jupiter ↗</a>
        <a className="btn ghost" href={`https://raydium.io/swap/?inputMint=sol&outputMint=${t.mint}`} target="_blank" rel="noreferrer">Raydium ↗</a>
        {t.website && <a className="btn ghost" href={t.website} target="_blank" rel="noreferrer nofollow">Website ↗</a>}
        {t.twitter && <a className="btn ghost" href={t.twitter} target="_blank" rel="noreferrer nofollow">X ↗</a>}
        {t.telegram && <a className="btn ghost" href={t.telegram} target="_blank" rel="noreferrer nofollow">Telegram ↗</a>}
      </div>

      {m ? (
        <div className="stats4">
          <div><small>Market cap</small><b>{usd(m.marketCap)}</b></div>
          <div><small>Liquidity</small><b>{usd(m.liquidityUsd)}</b></div>
          <div><small>Volume 24h</small><b>{usd(m.volume24h)}</b></div>
          <div><small>Supply</small><b>{Number(t.supply).toLocaleString()}</b></div>
        </div>
      ) : (
        <div className="note">No trading pool found yet. Market data and the chart appear once the token has a pool.</div>
      )}

      {m && (
        <div className="chart">
          <iframe
            title="Price chart"
            src={`https://dexscreener.com/solana/${m.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
            loading="lazy"
          />
        </div>
      )}

      <div className="tp-grid">
        <section className="card">
          <h3>About</h3>
          <p className="desc-full">{t.description || "No description provided."}</p>
        </section>
        <section className="card">
          <h3>Safety checks</h3>
          <ul className="checks">
            <li className={t.mintAuthority ? "bad" : "ok"}>{t.mintAuthority ? "Mint authority active — supply can grow" : "Mint authority revoked"}</li>
            <li className={t.freezeAuthority ? "bad" : "ok"}>{t.freezeAuthority ? "Freeze authority active" : "Freeze authority revoked"}</li>
            <li className={m ? "ok" : "bad"}>{m ? `Trading on ${m.dexId}` : "No liquidity pool yet"}</li>
          </ul>
          <p className="muted small">Automated checks only — always do your own research.</p>
          <a className="link small" href={explorerAddr(t.mint, net)} target="_blank" rel="noreferrer">View on Solscan ↗</a>
        </section>
      </div>

      <section className="card share">
        <div>
          <h3>Share this page</h3>
          <p className="muted small">Free for every Solana token, no sign-up.</p>
        </div>
        <div className="row tight">
          <a className="btn ghost sm" href={`https://x.com/intent/post?text=${shareText}&url=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Post on X</a>
          <a className="btn ghost sm" href={`https://t.me/share/url?url=${encodeURIComponent(share)}&text=${shareText}`} target="_blank" rel="noreferrer">Telegram</a>
          <button className="btn primary sm" onClick={() => go("promote", { mint: t.mint })}>Promote this token</button>
        </div>
      </section>
    </div>
  );
}
