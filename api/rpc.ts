// POST /api/rpc?net=mainnet|devnet — JSON-RPC proxy used by the browser app.
// Tries your configured RPC first, then free public endpoints, so the site keeps working when a
// provider is over quota or blocks browser requests. Only quota/access/transport failures fall
// through; genuine RPC answers (including transaction errors) are returned as-is.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { netOf, serverRpc } from "./_lib.js";

const BACKUPS = {
  mainnet: ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"],
  devnet: ["https://api.devnet.solana.com"],
} as const;

// Methods the proxy will forward (everything a wallet app needs; nothing admin-ish).
const ALLOWED = /^(get\w+|sendTransaction|simulateTransaction|isBlockhashValid|requestAirdrop|minimumLedgerSlot)$/;

const QUOTA_OR_ACCESS = /max usage|rate limit|too many|forbidden|access|personal token|api key|not allowed|unauthori|credits/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const net = netOf(req.query.net);
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 50 || calls.some((c: any) => !ALLOWED.test(String(c?.method)))) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Method not allowed" } });
  }

  const primary = serverRpc(net);
  const urls = [primary, ...BACKUPS[net].filter((u) => u !== primary)];
  const payload = JSON.stringify(body);
  let lastStatus = 502;
  let lastText = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "All RPC endpoints failed" } });

  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      const text = await r.text();
      let refused = r.status !== 200;
      if (!refused) {
        try {
          const j = JSON.parse(text);
          const errs = (Array.isArray(j) ? j : [j]).map((x: any) => x?.error?.message || "").filter(Boolean);
          refused = errs.some((m: string) => QUOTA_OR_ACCESS.test(m));
        } catch {
          refused = true; // not JSON (e.g. "max usage reached")
        }
      }
      if (!refused) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(text);
      }
      lastStatus = r.status === 200 ? 502 : r.status;
      lastText = text;
      console.warn(`[rpc-proxy] ${url.split("?")[0]} refused (${r.status}): ${text.slice(0, 100)}`);
    } catch (e) {
      console.warn(`[rpc-proxy] ${url.split("?")[0]} unreachable:`, (e as Error).message);
    }
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(lastStatus).send(lastText);
}
