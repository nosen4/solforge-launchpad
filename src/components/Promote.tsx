import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useNetwork } from "../App";
import { TIERS, TierId } from "../../shared/promo";
import { PROMO_WALLET, TokenInfo, fetchToken, payForPromotion, timeLeft, usePromotions } from "../lib/promo";
import { Field, Status, StatusLine, TxLink, errMsg } from "./ui";

const tokenUrl = (mint: string) => `/t/${mint}`;

export default function Promote({ initialMint }: { initialMint: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { net } = useNetwork();

  const [mint, setMint] = useState(initialMint);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [tier, setTier] = useState<TierId>("f24");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sig, setSig] = useState("");
  const [refresh, setRefresh] = useState(0);
  const { data: feed, error: feedError } = usePromotions(net, refresh);

  useEffect(() => setMint(initialMint), [initialMint]);

  // Look the token up as soon as a valid-looking address is entered.
  useEffect(() => {
    setToken(null);
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint.trim())) return setLookup("idle");
    let dead = false;
    setLookup("loading");
    fetchToken(mint.trim(), net)
      .then((t) => {
        if (dead) return;
        setToken(t);
        setLookup("idle");
        setWebsite((w) => w || t.website || "");
        setTwitter((w) => w || t.twitter || "");
        setTelegram((w) => w || t.telegram || "");
      })
      .catch(() => !dead && setLookup("error"));
    return () => {
      dead = true;
    };
  }, [mint, net]);

  const selected = TIERS.find((t) => t.id === tier)!;
  const okUrl = (u: string) => !u || /^https?:\/\/\S+$/.test(u);
  const formError = !token
    ? "Enter a valid token address"
    : ![website, twitter, telegram].every(okUrl)
      ? "Links must start with https://"
      : "";

  async function pay() {
    if (!wallet.connected) return setVisible(true);
    setSig("");
    try {
      setStatus({ kind: "busy", msg: "Approve the payment in your wallet…" });
      const s = await payForPromotion(connection, wallet, token!.mint, tier, { website, twitter, telegram });
      setSig(s);
      setStatus({ kind: "busy", msg: "Payment confirmed — activating your promotion…" });
      await new Promise((r) => setTimeout(r, 4000));
      setRefresh((n) => n + 1);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  const featured = feed?.active ?? [];

  return (
    <>
      <section className="hero">
        <h1>
          Get your token <span className="accent">featured.</span>
        </h1>
        <p className="lead">
          Pin your token at the top of SolForge, run a banner across every page, and get a free shareable token page.
          Pay in SOL. Your spot starts the moment the payment confirms.
        </p>
      </section>

      <section className="card hero-card">
        <Field label="Token address">
          <input className="mono" value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="Solana token mint address" />
        </Field>
        {lookup === "loading" && <div className="status busy"><span className="spin" /> Looking up token…</div>}
        {lookup === "error" && <div className="status error">⚠ Token not found on {net}.</div>}
        {token && (
          <div className="token-preview">
            {token.image ? <img src={token.image} alt="" /> : <div className="ph">{token.symbol.slice(0, 2)}</div>}
            <div>
              <h3>{token.name}</h3>
              <span className="mono muted">${token.symbol}</span>{" "}
              <a className="link small" href={tokenUrl(token.mint)} target="_blank" rel="noreferrer">View free token page ↗</a>
            </div>
          </div>
        )}

        <div className="grid3">
          <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value.trim())} placeholder="https://" /></Field>
          <Field label="X / Twitter"><input value={twitter} onChange={(e) => setTwitter(e.target.value.trim())} placeholder="https://x.com/…" /></Field>
          <Field label="Telegram"><input value={telegram} onChange={(e) => setTelegram(e.target.value.trim())} placeholder="https://t.me/…" /></Field>
        </div>

        <h3 className="sub">Choose a package</h3>
        <div className="tiers">
          {TIERS.map((t) => (
            <button key={t.id} type="button" className={`tier ${tier === t.id ? "on" : ""} ${t.banner ? "hot" : ""}`} onClick={() => setTier(t.id)}>
              {t.banner && <em>Most visible</em>}
              <b>{t.label}</b>
              <span className="tier-price">{t.sol} SOL</span>
              <ul>{t.perks.map((p) => <li key={p}>{p}</li>)}</ul>
            </button>
          ))}
        </div>

        <p className="muted small">
          Placement is on SolForge only. Third-party sites such as DexScreener or DexTools sell their own boosts (see
          below); we don't claim to place tokens there. Paying again while active extends your time. Banner slots are
          limited; if they're full, yours starts when the next one frees up.
        </p>

        <StatusLine s={status} />
        {sig && (
          <div className="note ok">
            Paid: <TxLink sig={sig} net={net} /> — your token is now in the Featured list below.
          </div>
        )}
        <div className="row end">
          <button className="btn primary" disabled={!!wallet.connected && (!!formError || status.kind === "busy")} title={formError} onClick={pay}>
            {!wallet.connected ? "Connect wallet" : formError || `Pay ${selected.sol} SOL & promote`}
          </button>
        </div>
        <p className="muted small">
          Payment goes to <span className="mono">{PROMO_WALLET.toBase58().slice(0, 4)}…{PROMO_WALLET.toBase58().slice(-4)}</span>{" "}
          with a short note recording your token and package. Promotions are not refundable and aren't an endorsement.
        </p>
      </section>

      <section className="board">
        <div className="board-head">
          <h2>Featured now</h2>
          <button className="link small" onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
        </div>
        {feedError && <div className="note warn">{feedError}</div>}
        {feed && !featured.length && <div className="note">No featured tokens right now. Be the first!</div>}
        <div className="tgrid">
          {featured.map((p) => (
            <a key={p.signature} className="tcard link-card" href={tokenUrl(p.mint)}>
              <header>
                {p.icon ? <img src={p.icon} alt="" /> : <div className="ph">{(p.symbol || "?").slice(0, 2)}</div>}
                <div>
                  <h4>{p.name || p.mint.slice(0, 6)}</h4>
                  <span className="mono muted">${p.symbol || "—"}</span>
                </div>
                {p.banner && <span className="badge">Banner</span>}
              </header>
              <div className="tstats"><span>★ Featured</span><b>{timeLeft(p.end)}</b></div>
            </a>
          ))}
        </div>
        {!!feed?.queued.length && <p className="muted small">{feed.queued.length} more promotion(s) queued to start soon.</p>}
      </section>

      <section className="card cta-split">
        <div>
          <h3>Want the official DexScreener boost too?</h3>
          <p className="muted">
            DexScreener sells boosts directly: open your token on DexScreener and click the yellow <b>Boost</b> button.
            They also sell <b>Enhanced Token Info</b> to show your logo, banner and socials on their site.
          </p>
        </div>
        <div className="row">
          <a className="btn ghost" href={token ? `https://dexscreener.com/solana/${token.mint}` : "https://dexscreener.com/solana"} target="_blank" rel="noreferrer">Open on DexScreener ↗</a>
          <a className="btn ghost" href="https://marketplace.dexscreener.com/product/token-info" target="_blank" rel="noreferrer">Enhanced Token Info ↗</a>
        </div>
      </section>
    </>
  );
}

/** Rotating site-wide banner for active banner promotions. */
export function PromoBanner() {
  const { net } = useNetwork();
  const { data } = usePromotions(net);
  const banners = data?.active.filter((p) => p.banner) ?? [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setI((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  const p = banners[i % banners.length];
  return (
    <a className="promo-banner" href={tokenUrl(p.mint)}>
      <span className="ad">Promoted</span>
      {p.icon && <img src={p.icon} alt="" />}
      <b>{p.name || p.mint.slice(0, 6)}</b>
      <span className="mono">${p.symbol || ""}</span>
      <span className="go">View token →</span>
    </a>
  );
}

/** Small featured strip used on the Trending page. */
export function FeaturedStrip() {
  const { net } = useNetwork();
  const { data } = usePromotions(net);
  const items = data?.active ?? [];
  const uniq = items.filter((p, idx) => items.findIndex((q) => q.mint === p.mint) === idx);
  return (
    <section className="featured-strip">
      <div className="board-head">
        <h3>★ Featured on SolForge</h3>
        <a className="link small" href="#/promote">Get featured →</a>
      </div>
      {uniq.length ? (
        <div className="strip">
          {uniq.map((p) => (
            <a key={p.mint} href={tokenUrl(p.mint)} className="chip-token">
              {p.icon ? <img src={p.icon} alt="" /> : <span className="ph sm">{(p.symbol || "?").slice(0, 2)}</span>}
              <b>{p.symbol ? `$${p.symbol}` : p.mint.slice(0, 6)}</b>
              <small>{timeLeft(p.end)}</small>
            </a>
          ))}
        </div>
      ) : (
        <p className="muted small">No featured tokens right now — <a className="link" href="#/promote">yours could be here</a>.</p>
      )}
    </section>
  );
}
