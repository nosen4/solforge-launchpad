import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Network, RPC_URLS, SITE_NAME } from "./config";
import CreateToken from "./components/CreateToken";
import CreatePool from "./components/CreatePool";
import ManageLiquidity from "./components/ManageLiquidity";
import Trending from "./components/Trending";
import Faq from "./components/Faq";

const NetCtx = createContext<{ net: Network; setNet: (n: Network) => void }>({ net: "mainnet", setNet: () => {} });
export const useNetwork = () => useContext(NetCtx);

export type Route = "create" | "pool" | "liquidity" | "trending";

export function useRoute(): [Route, URLSearchParams] {
  const read = () => {
    const [path, qs] = window.location.hash.replace(/^#\/?/, "").split("?");
    const r = (["create", "pool", "liquidity", "trending"].includes(path) ? path : "create") as Route;
    return [r, new URLSearchParams(qs || "")] as [Route, URLSearchParams];
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => {
      setState(read());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return state;
}

export const go = (r: Route, params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  window.location.hash = `/${r}${qs}`;
};

const NAV: { r: Route; label: string; tag?: string }[] = [
  { r: "create", label: "Create Token" },
  { r: "pool", label: "Raydium Pool" },
  { r: "liquidity", label: "Manage Liquidity" },
  { r: "trending", label: "Trending", tag: "NEW" },
];

function Shell() {
  const [route, params] = useRoute();
  const { net, setNet } = useNetwork();
  return (
    <>
      <header className="hdr">
        <a className="logo" href="#/create">
          <span className="logo-mark">▲</span> {SITE_NAME}
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.r} href={`#/${n.r}`} className={route === n.r ? "on" : ""}>
              {n.label}
              {n.tag && <em>{n.tag}</em>}
            </a>
          ))}
        </nav>
        <div className="hdr-right">
          <select className="net" value={net} onChange={(e) => setNet(e.target.value as Network)}>
            <option value="mainnet">Mainnet</option>
            <option value="devnet">Devnet</option>
          </select>
          <WalletMultiButton />
        </div>
      </header>

      {net === "devnet" && <div className="banner">Devnet mode — tokens and pools here have no real value. Great for testing.</div>}

      <main>
        {route === "create" && <CreateToken />}
        {route === "pool" && <CreatePool initialMint={params.get("mint") || ""} />}
        {route === "liquidity" && <ManageLiquidity initialPool={params.get("pool") || ""} />}
        {route === "trending" && <Trending />}
        <Faq />
      </main>

      <footer className="ftr">
        <p>
          {SITE_NAME} is a non-custodial interface. Every transaction is built in your browser and signed by your own
          wallet; we never hold your keys, tokens or liquidity. Nothing here is financial advice. Crypto assets are
          highly risky — use at your own risk.
        </p>
        <p className="muted">© {new Date().getFullYear()} {SITE_NAME}</p>
      </footer>
    </>
  );
}

export default function App() {
  const [net, setNetState] = useState<Network>(() => (localStorage.getItem("net") as Network) || "mainnet");
  const setNet = (n: Network) => {
    try {
      localStorage.setItem("net", n);
    } catch {}
    setNetState(n);
  };
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <NetCtx.Provider value={{ net, setNet }}>
      <ConnectionProvider endpoint={RPC_URLS[net]} key={net}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <Shell />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </NetCtx.Provider>
  );
}
