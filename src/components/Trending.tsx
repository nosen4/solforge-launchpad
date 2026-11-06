import { useEffect, useState } from "react";
import { go } from "../App";
import { TEMPLATE_KEY, Template } from "./CreateToken";

interface T {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  description: string;
  marketCap: number | null;
  change24h: number | null;
  volume24h: number | null;
  url: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

const fmt = (n: number | null) =>
  n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

export default function Trending() {
  const [tab, setTab] = useState<"trending" | "new">("trending");
  const [tokens, setTokens] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    fetch(`/api/trending?tab=${tab}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (d.error) throw new Error(d.error);
        setTokens(d.tokens || []);
      })
      .catch((e) => !dead && setError(e.message || "Failed to load"))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [tab]);

  function useTemplate(t: T) {
    const tpl: Template = {
      fromName: t.name,
      fromSymbol: t.symbol,
      description: t.description,
    };
    sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify(tpl));
    go("create");
  }

  return (
    <>
      <section className="hero">
        <h1>What's <span className="accent">trending</span> on Solana</h1>
        <p className="lead">
          Live from DexScreener. Spot what's moving, then start your own launch from a trending coin's description —
          with your own name, ticker and art.
        </p>
      </section>

      <div className="tabs">
        <button className={tab === "trending" ? "on" : ""} onClick={() => setTab("trending")}>🔥 Trending</button>
        <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>✨ New</button>
      </div>

      {error && <div className="note warn">{error}</div>}

      <div className="tgrid">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <div key={i} className="tcard skel" />)
          : tokens.map((t) => (
              <article key={t.address} className="tcard">
                <header>
                  {t.icon && !broken[t.address] ? (
                    <img
                      src={t.icon}
                      alt=""
                      loading="lazy"
                      onError={() => setBroken((b) => ({ ...b, [t.address]: true }))}
                    />
                  ) : (
                    <div className="ph">{t.symbol.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div>
                    <h4>{t.name}</h4>
                    <span className="mono muted">${t.symbol}</span>
                  </div>
                  {t.change24h != null && (
                    <span className={`chg ${t.change24h >= 0 ? "up" : "down"}`}>
                      {t.change24h >= 0 ? "+" : ""}
                      {t.change24h.toFixed(1)}%
                    </span>
                  )}
                </header>
                <p className="desc">{t.description || "No description."}</p>
                <div className="tstats">
                  <span>MC <b>{fmt(t.marketCap)}</b></span>
                  <span>Vol 24h <b>{fmt(t.volume24h)}</b></span>
                </div>
                <footer>
                  <a className="btn ghost sm" href={t.url} target="_blank" rel="noreferrer">Chart ↗</a>
                  <button className="btn primary sm" onClick={() => useTemplate(t)}>Use as template</button>
                </footer>
              </article>
            ))}
      </div>

      <section className="card cta">
        <h3>Rather start from scratch?</h3>
        <p className="muted">Design your own token with a custom name, symbol and image.</p>
        <button className="btn primary" onClick={() => go("create")}>Create custom token</button>
      </section>
    </>
  );
}
