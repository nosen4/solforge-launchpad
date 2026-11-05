import { FEE_WALLET, FEES, SITE_NAME } from "../config";

const QA: [string, string][] = [
  [
    `What is ${SITE_NAME}?`,
    `A no-code, non-custodial interface for creating SPL tokens on Solana and opening Raydium liquidity pools. Every transaction is built in your browser and signed by your wallet.`,
  ],
  [
    "How much does it cost?",
    FEE_WALLET
      ? `Token creation is ${FEES.createToken} SOL, plus ${FEES.revokeMint}–${FEES.revokeUpdate} SOL per authority you revoke. Creating a Raydium pool costs ${FEES.createPool} SOL plus Raydium's own ~0.15 SOL create fee. Removing liquidity costs ${FEES.removeLiquidity} SOL. Solana network fees and rent apply.`
      : "Only Solana network fees, rent and Raydium's own pool-creation fee (~0.15 SOL).",
  ],
  [
    "Why revoke mint and freeze authority?",
    "Revoking mint authority fixes the supply forever. Revoking freeze authority means no one can lock holders' tokens — Raydium and most scanners flag tokens that still have it.",
  ],
  [
    "Which Raydium pool type is used?",
    "Raydium CPMM (constant-product, standard AMM v2). It doesn't need an OpenBook market, supports Token-2022, and is routed by Jupiter automatically.",
  ],
  [
    "How much liquidity should I add?",
    "Your token amount and SOL amount set the starting price. More SOL means less price impact per trade. There's no minimum beyond Raydium's fee, but very thin pools are volatile.",
  ],
  [
    "What does burning LP do?",
    "LP tokens are your claim on the pool. Burning them locks the liquidity forever — nobody, including you, can withdraw it. It's irreversible.",
  ],
  [
    "Can I test first?",
    "Yes — switch the network selector to Devnet, grab free SOL from faucet.solana.com, and run through the whole flow without real money.",
  ],
];

export default function Faq() {
  return (
    <section className="faq">
      <h2>FAQ</h2>
      {QA.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}
