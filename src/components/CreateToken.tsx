import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { FEE_WALLET, FEES, explorerAddr } from "../config";
import { createToken, totalFee } from "../lib/token";
import { uploadMetadata } from "../lib/upload";
import { go, useNetwork } from "../App";
import { Copy, Field, Status, StatusLine, Toggle, TxLink, errMsg } from "./ui";

export const TEMPLATE_KEY = "sf_template";
export interface Template {
  fromName: string;
  fromSymbol: string;
  description: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

const STEPS = ["Token details", "Socials & security", "Review & launch"];

export default function CreateToken() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { net } = useNetwork();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(9);
  const [supply, setSupply] = useState("1000000000");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [manualUri, setManualUri] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeFreeze, setRevokeFreeze] = useState(true);
  const [revokeUpdate, setRevokeUpdate] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [result, setResult] = useState<{ mint: string; sig: string } | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);

  // Prefill from Trending → "Use as template"
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TEMPLATE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(TEMPLATE_KEY);
      const t: Template = JSON.parse(raw);
      setTemplate(t);
      setDescription(t.description || "");
      setWebsite(t.website || "");
      setTwitter(t.twitter || "");
      setTelegram(t.telegram || "");
    } catch {}
  }, []);

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : ""), [image]);
  const fee = totalFee({ revokeMint, revokeFreeze, revokeUpdate });

  const clash =
    template &&
    (name.trim().toLowerCase() === template.fromName.trim().toLowerCase() ||
      symbol.trim().toLowerCase() === template.fromSymbol.trim().toLowerCase());

  const step0Error = (() => {
    if (!name.trim()) return "Enter a token name";
    if (name.length > 32) return "Name max 32 characters";
    if (!symbol.trim()) return "Enter a symbol";
    if (symbol.length > 10) return "Symbol max 10 characters";
    if (clash) return "Pick a name and ticker different from the token you started from";
    if (!/^\d+(\.\d+)?$/.test(supply) || Number(supply) <= 0) return "Enter a valid supply";
    if (!useManual && !image) return "Upload a token image";
    if (useManual && !/^https?:\/\//.test(manualUri)) return "Enter a valid metadata URI";
    if (image && image.size > 3 * 1024 * 1024) return "Image must be under 3 MB";
    return "";
  })();

  async function launch() {
    if (!wallet.connected) return setVisible(true);
    setResult(null);
    try {
      let uri = manualUri;
      if (!useManual) {
        setStatus({ kind: "busy", msg: "Uploading image & metadata to IPFS…" });
        uri = await uploadMetadata({ name, symbol, description, image: image!, website, twitter, telegram });
      }
      setStatus({ kind: "busy", msg: "Approve the transaction in your wallet…" });
      const r = await createToken(connection, wallet, {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        uri,
        decimals,
        supply,
        revokeMint,
        revokeFreeze,
        revokeUpdate,
      });
      setResult({ mint: r.mint.toBase58(), sig: r.signature });
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    }
  }

  if (result) {
    return (
      <section className="card hero-card success">
        <div className="big-check">✓</div>
        <h2>{symbol.toUpperCase()} is live on Solana</h2>
        <div className="kv">
          <span>Mint address</span>
          <Copy text={result.mint} />
          <span>Transaction</span>
          <TxLink sig={result.sig} net={net} />
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => go("pool", { mint: result.mint })}>
            Create Raydium pool →
          </button>
          <a className="btn ghost" href={explorerAddr(result.mint, net)} target="_blank" rel="noreferrer">
            View on Solscan
          </a>
        </div>
        <button className="link" onClick={() => { setResult(null); setStep(0); }}>
          Create another token
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <h1>
          Launch a Solana token<br />
          <span className="accent">in under a minute.</span>
        </h1>
        <p className="lead">
          Mint an SPL token with metadata, revoke authorities, then open a Raydium pool — all from your own wallet.
          {FEE_WALLET ? ` From ${FEES.createToken} SOL.` : ""}
        </p>
      </section>

      <section className="card hero-card">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>
              <span>{i < step ? "✓" : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        {template && (
          <div className="note">
            Started from <b>{template.fromName} (${template.fromSymbol})</b>. Its description is prefilled —
            give your token its own name, ticker and image.
          </div>
        )}

        {step === 0 && (
          <div className="grid2">
            <Field label="Token name" hint="Max 32 characters">
              <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Moon Otter" />
            </Field>
            <Field label="Symbol" hint="Max 10 characters">
              <input
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="OTTER"
              />
            </Field>
            <Field label="Decimals" hint="9 for meme coins, 6 common for utility, 0 for whitelist tokens">
              <select value={decimals} onChange={(e) => setDecimals(Number(e.target.value))}>
                {[0, 2, 4, 5, 6, 8, 9].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Total supply" hint={Number(supply) ? Number(supply).toLocaleString() + " tokens" : ""}>
              <input value={supply} onChange={(e) => setSupply(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="Description">
              <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the story?" />
            </Field>
            <div className="field">
              <span className="field-label">
                Token image
                <button type="button" className="link small" onClick={() => setUseManual(!useManual)}>
                  {useManual ? "Upload image instead" : "I already have a metadata URI"}
                </button>
              </span>
              {useManual ? (
                <input value={manualUri} onChange={(e) => setManualUri(e.target.value)} placeholder="https://…/metadata.json" />
              ) : (
                <label className="drop">
                  {preview ? <img src={preview} alt="" /> : <span>Drop PNG / JPG / GIF / WEBP<br /><small>square, max 3 MB</small></span>}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => setImage(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="grid3">
              <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
              <Field label="X / Twitter"><input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" /></Field>
              <Field label="Telegram"><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" /></Field>
            </div>
            <h3 className="sub">Authorities</h3>
            <div className="toggles">
              <Toggle checked={revokeMint} onChange={setRevokeMint} title="Revoke mint authority" desc="Supply is fixed forever. Buyers & scanners expect this." price={FEE_WALLET ? `+${FEES.revokeMint} SOL` : undefined} />
              <Toggle checked={revokeFreeze} onChange={setRevokeFreeze} title="Revoke freeze authority" desc="Required for Raydium pools — nobody can freeze holders' tokens." price={FEE_WALLET ? `+${FEES.revokeFreeze} SOL` : undefined} />
              <Toggle checked={revokeUpdate} onChange={setRevokeUpdate} title="Revoke update authority" desc="Name, symbol and image become permanent." price={FEE_WALLET ? `+${FEES.revokeUpdate} SOL` : undefined} />
            </div>
            {!revokeFreeze && <div className="note warn">Raydium won't list pools for tokens that still have a freeze authority.</div>}
          </>
        )}

        {step === 2 && (
          <div className="review">
            <div className="token-preview">
              {preview ? <img src={preview} alt="" /> : <div className="ph">{symbol.slice(0, 2)}</div>}
              <div>
                <h3>{name}</h3>
                <span className="mono">${symbol}</span>
              </div>
            </div>
            <div className="kv">
              <span>Supply</span><b>{Number(supply).toLocaleString()}</b>
              <span>Decimals</span><b>{decimals}</b>
              <span>Mint authority</span><b>{revokeMint ? "Revoked" : "You"}</b>
              <span>Freeze authority</span><b>{revokeFreeze ? "Revoked" : "You"}</b>
              <span>Metadata</span><b>{revokeUpdate ? "Immutable" : "Updatable by you"}</b>
              <span>Platform fee</span><b>{fee.toFixed(2)} SOL</b>
              <span>Network + rent</span><b>≈ 0.02 SOL</b>
            </div>
            <p className="muted small">Fees are shown before approval and only charged if you sign. Everything happens in one transaction.</p>
          </div>
        )}

        <StatusLine s={status} />

        <div className="row end">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 2 ? (
            <button
              className="btn primary"
              disabled={step === 0 && !!step0Error}
              title={step === 0 ? step0Error : ""}
              onClick={() => setStep(step + 1)}
            >
              {step === 0 && step0Error ? step0Error : "Continue"}
            </button>
          ) : (
            <button className="btn primary" disabled={status.kind === "busy"} onClick={launch}>
              {wallet.connected ? `Create token · ${fee.toFixed(2)} SOL` : "Connect wallet"}
            </button>
          )}
        </div>
      </section>

      <section className="howto">
        <h2>How it works</h2>
        <ol>
          <li><b>Connect</b> Phantom or Solflare and make sure you hold enough SOL.</li>
          <li><b>Describe</b> your token — name, ticker, supply, image.</li>
          <li><b>Secure</b> it by revoking mint & freeze authority.</li>
          <li><b>Sign once.</b> The mint, metadata and your full supply land in your wallet.</li>
          <li><b>Open a Raydium pool</b> by pairing your token with SOL to make it tradable.</li>
          <li><b>Manage liquidity</b> — withdraw or burn LP from the Manage tab.</li>
        </ol>
      </section>
    </>
  );
}
