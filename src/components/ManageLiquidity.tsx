import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { FEE_WALLET, FEES, raydiumPoolUrl } from "../config";
import { burnLp, getPoolPosition, removeLiquidity } from "../lib/raydium";
import { useNetwork } from "../App";
import { Field, Status, StatusLine, TxLink, errMsg } from "./ui";

interface Pos {
  symbolA: string;
  symbolB: string;
  reserveA: number;
  reserveB: number;
  lp: number;
  lpSupply: number;
}

export default function ManageLiquidity({ initialPool }: { initialPool: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { net } = useNetwork();

  const [poolId, setPoolId] = useState(initialPool);
  const [pos, setPos] = useState<Pos | null>(null);
  const [pct, setPct] = useState(100);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sig, setSig] = useState("");
  const [confirmBurn, setConfirmBurn] = useState(false);

  useEffect(() => setPoolId(initialPool), [initialPool]);

  async function load() {
    if (!wallet.connected) return setVisible(true);
    setPos(null);
    setSig("");
    try {
      setStatus({ kind: "busy", msg: "Loading pool…" });
      const p = await getPoolPosition(connection, wallet, net, poolId.trim());
      const lpDiv = 10 ** p.lpDecimals;
      setPos({
        symbolA: p.poolInfo.mintA.symbol || p.poolInfo.mintA.address.slice(0, 4),
        symbolB: p.poolInfo.mintB.symbol || p.poolInfo.mintB.address.slice(0, 4),
        reserveA: p.poolInfo.mintAmountA,
        reserveB: p.poolInfo.mintAmountB,
        lp: Number(p.lpBalance.toString()) / lpDiv,
        lpSupply: p.poolInfo.lpAmount,
      });
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  useEffect(() => {
    if (initialPool && wallet.connected) load();
  }, [initialPool, wallet.connected, net]);

  const share = pos && pos.lpSupply ? pos.lp / pos.lpSupply : 0;

  async function withdraw() {
    try {
      setStatus({ kind: "busy", msg: "Approve in your wallet…" });
      const s = await removeLiquidity(connection, wallet, net, poolId.trim(), pct);
      setSig(s);
      await load();
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  async function burn() {
    try {
      setStatus({ kind: "busy", msg: "Approve the burn in your wallet…" });
      const s = await burnLp(connection, wallet, net, poolId.trim());
      setSig(s);
      setConfirmBurn(false);
      await load();
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Manage <span className="accent">liquidity</span></h1>
        <p className="lead">Withdraw from a Raydium CPMM pool, or burn your LP tokens to permanently lock liquidity.</p>
      </section>

      <section className="card hero-card">
        <Field label="Raydium CPMM pool ID">
          <div className="row tight">
            <input className="mono" value={poolId} onChange={(e) => setPoolId(e.target.value.trim())} placeholder="Pool ID" />
            <button className="btn ghost" onClick={load} disabled={poolId.length < 32 || status.kind === "busy"}>
              {wallet.connected ? "Load" : "Connect"}
            </button>
          </div>
        </Field>

        {pos && (
          <>
            <div className="stats">
              <div><small>Pool reserves</small><b>{pos.reserveA.toLocaleString()} {pos.symbolA}</b><b>{pos.reserveB.toLocaleString()} {pos.symbolB}</b></div>
              <div><small>Your LP</small><b>{pos.lp.toLocaleString()}</b><span className="muted">{(share * 100).toFixed(2)}% of pool</span></div>
              <div><small>Your share ≈</small><b>{(pos.reserveA * share).toLocaleString()} {pos.symbolA}</b><b>{(pos.reserveB * share).toFixed(4)} {pos.symbolB}</b></div>
            </div>

            {pos.lp > 0 ? (
              <>
                <h3 className="sub">Remove liquidity</h3>
                <div className="row tight">
                  {[25, 50, 75, 100].map((p) => (
                    <button key={p} className={`chip ${pct === p ? "on" : ""}`} onClick={() => setPct(p)}>{p}%</button>
                  ))}
                  <input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
                </div>
                <p className="muted small">
                  You'll receive ≈ {(pos.reserveA * share * pct / 100).toLocaleString()} {pos.symbolA} + {(pos.reserveB * share * pct / 100).toFixed(4)} {pos.symbolB}
                  {FEE_WALLET ? ` · platform fee ${FEES.removeLiquidity} SOL` : ""}
                </p>
                <div className="row end">
                  <button className="btn ghost danger" onClick={() => setConfirmBurn(true)}>Burn LP 🔥</button>
                  <button className="btn primary" onClick={withdraw} disabled={status.kind === "busy"}>Remove {pct}%</button>
                </div>
                {confirmBurn && (
                  <div className="note warn">
                    Burning destroys <b>all</b> your LP tokens. The liquidity stays in the pool forever and you can never withdraw it.
                    <div className="row end">
                      <button className="btn ghost" onClick={() => setConfirmBurn(false)}>Cancel</button>
                      <button className="btn danger" onClick={burn}>Yes, burn permanently</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="note">This wallet holds no LP tokens for this pool.</div>
            )}
            {net === "mainnet" && <a className="link" href={raydiumPoolUrl(poolId)} target="_blank" rel="noreferrer">View pool on Raydium ↗</a>}
          </>
        )}

        {sig && <div className="note ok">Done: <TxLink sig={sig} net={net} /></div>}
        <StatusLine s={status} />
      </section>
    </>
  );
}
