import { ReactNode } from "react";
import { explorerTx, Network } from "../config";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  title,
  desc,
  price,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
  price?: string;
}) {
  return (
    <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="sw" />
      <span className="toggle-body">
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      {price && <span className="price">{price}</span>}
    </button>
  );
}

export type Status = { kind: "idle" } | { kind: "busy"; msg: string } | { kind: "error"; msg: string };

export function StatusLine({ s }: { s: Status }) {
  if (s.kind === "idle") return null;
  return <div className={`status ${s.kind}`}>{s.kind === "busy" ? <span className="spin" /> : "⚠"} {s.msg}</div>;
}

export function TxLink({ sig, net }: { sig: string; net: Network }) {
  return (
    <a className="mono" href={explorerTx(sig, net)} target="_blank" rel="noreferrer">
      {sig.slice(0, 8)}…{sig.slice(-8)} ↗
    </a>
  );
}

export function Copy({ text }: { text: string }) {
  return (
    <button type="button" className="copy mono" onClick={() => navigator.clipboard?.writeText(text)} title="Copy">
      {text.slice(0, 6)}…{text.slice(-6)} ⧉
    </button>
  );
}

export const errMsg = (e: any) => {
  const m = e?.message || String(e);
  if (/User rejected|rejected the request/i.test(m)) return "You cancelled the transaction in your wallet.";
  if (/insufficient|0x1\b/i.test(m)) return "Insufficient SOL or token balance for this transaction.";
  return m;
};
