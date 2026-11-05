import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { ApiCpmmConfigInfo } from "@raydium-io/raydium-sdk-v2";
import { FEE_WALLET, FEES, raydiumPoolUrl } from "../config";
import { createPool, getFeeTiers, initRaydium } from "../lib/raydium";
import { go, useNetwork } from "../App";
import { Copy, Field, Status, StatusLine, TxLink, errMsg } from "./ui";

export default function CreatePool({ initialMint }: { initialMint: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { net } = useNetwork();

  const [mint, setMint] = useState(initialMint);
  const [tokenAmount, setTokenAmount] = useState("");
  const [solAmount, setSolAmount] = useState("");
  const [tiers, setTiers] = useState<ApiCpmmConfigInfo[]>([]);
  const [tier, setTier] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [result, setResult] = useState<{ poolId: string; sig: string } | null>(null);

  useEffect(() => setMint(initialMint), [initialMint]);

  useEffect(() => {
    if (!wallet.publicKey || !wallet.signAllTransactions) return;
    let dead = false;
    (async () => {
      try {
        const r = await initRaydium(connection, wallet, net);
        const t = await getFeeTiers(r, net);
        if (dead) return;
        setTiers(t);
        const def = t.find((x) => x.tradeFeeRate === 2500) ?? t[0];
        setTier(def?.id || "");
      } catch (e) {
        if (!dead) setStatus({ kind: "error", msg: "Couldn't load Raydium fee tiers: " + errMsg(e) });
      }
    })();
    return () => {
      dead = true;
    };
  }, [wallet.publicKey, net]);

  const price = Number(solAmount) && Number(tokenAmount) ? Number(solAmount) / Number(tokenAmount) : 0;
  const valid = mint.length >= 32 && Number(tokenAmount) > 0 && Number(solAmount) > 0 && tier && (startNow || startAt);

  async function submit() {
    if (!wallet.connected) return setVisible(true);
    try {
      setStatus({ kind: "busy", msg: "Building pool transaction — approve in your wallet…" });
      const r = await createPool(connection, wallet, net, {
        tokenMint: mint.trim(),
        tokenAmount,
        solAmount,
        feeConfigId: tier,
        startNow,
        startTime: startAt ? new Date(startAt) : undefined,
      });
      setResult({ poolId: r.poolId, sig: r.signature });
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  if (result) {
    return (
      <section className="card hero-card success">
        <div className="big-check">✓</div>
        <h2>Raydium pool created</h2>
        <div className="kv">
          <span>Pool ID</span><Copy text={result.poolId} />
          <span>Transaction</span><TxLink sig={result.sig} net={net} />
        </div>
        <div className="row">
          {net === "mainnet" && (
            <a className="btn primary" href={raydiumPoolUrl(result.poolId)} target="_blank" rel="noreferrer">Open on Raydium ↗</a>
          )}
          <button className="btn ghost" onClick={() => go("liquidity", { pool: result.poolId })}>Manage liquidity</button>
        </div>
        <p className="muted small">Raydium's UI and DexScreener can take 10–15 minutes to index a new pool.</p>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <h1>Open a <span className="accent">Raydium pool</span></h1>
        <p className="lead">
          Pair your token with SOL on Raydium's CPMM (constant-product) program. No OpenBook market needed — the pool
          is tradable on Raydium, Jupiter and every aggregator.
        </p>
      </section>

      <section className="card hero-card">
        <Field label="Token mint address">
          <input className="mono" value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="Your token's mint address" />
        </Field>
        <div className="pair">
          <Field label="Token amount" hint="How many of your tokens go into the pool">
            <input value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="800000000" />
          </Field>
          <div className="plus">+</div>
          <Field label="SOL amount" hint="Initial SOL liquidity">
            <input value={solAmount} onChange={(e) => setSolAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="5" />
          </Field>
        </div>
        {price > 0 && (
          <div className="note">
            Starting price: <b className="mono">{price.toExponential(4)} SOL</b> per token
          </div>
        )}
        <div className="grid2">
          <Field label="Swap fee tier" hint="Fee traders pay on each swap, shared with LPs">
            <select value={tier} onChange={(e) => setTier(e.target.value)} disabled={!tiers.length}>
              {!tiers.length && <option>{wallet.connected ? "Loading…" : "Connect wallet to load"}</option>}
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {(t.tradeFeeRate / 10000).toFixed(2)}% · create fee {(Number(t.createPoolFee) / 1e9).toFixed(2)} SOL
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trading starts">
            <div className="row tight">
              <button type="button" className={`chip ${startNow ? "on" : ""}`} onClick={() => setStartNow(true)}>Immediately</button>
              <button type="button" className={`chip ${!startNow ? "on" : ""}`} onClick={() => setStartNow(false)}>Scheduled</button>
            </div>
            {!startNow && <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />}
          </Field>
        </div>

        <div className="kv">
          <span>Raydium create fee</span><b>{tiers.find((t) => t.id === tier) ? (Number(tiers.find((t) => t.id === tier)!.createPoolFee) / 1e9).toFixed(2) : "~0.15"} SOL</b>
          <span>Platform fee</span><b>{FEE_WALLET ? FEES.createPool : 0} SOL</b>
          <span>Rent + network</span><b>≈ 0.03 SOL</b>
        </div>

        <StatusLine s={status} />
        <div className="row end">
          <button className="btn primary" disabled={!!wallet.connected && (!valid || status.kind === "busy")} onClick={submit}>
            {wallet.connected ? "Create pool" : "Connect wallet"}
          </button>
        </div>
      </section>
    </>
  );
}
