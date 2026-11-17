import type { Connection } from "@solana/web3.js";

/**
 * Waits for a transaction by polling its status over plain HTTP.
 * (connection.confirmTransaction relies on a websocket to the RPC provider, which
 * silently never answers when the provider is over quota — so we don't use it.)
 */
export async function confirmSig(
  connection: Connection,
  signature: string,
  lastValidBlockHeight?: number,
  timeoutMs = 120_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const s = value[0];
      if (s?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(s.err)}`);
      if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
      if (lastValidBlockHeight) {
        const h = await connection.getBlockHeight("confirmed");
        if (h > lastValidBlockHeight) {
          // one last look before declaring it expired
          const again = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
          if (again && !again.err) return;
          throw new Error("Transaction expired before it was confirmed — nothing was charged. Please try again.");
        }
      }
    } catch (e) {
      if ((e as Error).message.startsWith("Transaction")) throw e;
      /* transient RPC error — keep polling */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Still not confirmed after ${timeoutMs / 1000}s. Check ${signature.slice(0, 12)}… on Solscan before retrying.`);
}
