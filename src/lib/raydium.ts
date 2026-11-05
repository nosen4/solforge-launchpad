import {
  Raydium,
  TxVersion,
  Percent,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  ApiCpmmConfigInfo,
} from "@raydium-io/raydium-sdk-v2";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { FEE_WALLET, FEES, Network } from "../config";
import { toBaseUnits } from "./token";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const programs = (net: Network) =>
  net === "devnet"
    ? {
        program: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        feeAcc: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
      }
    : { program: CREATE_CPMM_POOL_PROGRAM, feeAcc: CREATE_CPMM_POOL_FEE_ACC };

export async function initRaydium(connection: Connection, wallet: WalletContextState, net: Network) {
  if (!wallet.publicKey || !wallet.signAllTransactions) throw new Error("Wallet must support signAllTransactions");
  return Raydium.load({
    connection,
    owner: wallet.publicKey,
    cluster: net,
    signAllTransactions: wallet.signAllTransactions,
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });
}

/** Raydium CPMM fee tiers (0.25%, 1%, 2%, 4% …). */
export async function getFeeTiers(raydium: Raydium, net: Network): Promise<ApiCpmmConfigInfo[]> {
  const configs = await raydium.api.getCpmmConfigs();
  if (net === "devnet") {
    configs.forEach((c) => {
      c.id = getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, c.index).publicKey.toBase58();
    });
  }
  return configs.sort((a, b) => a.tradeFeeRate - b.tradeFeeRate);
}

async function payPlatformFee(connection: Connection, wallet: WalletContextState, sol: number) {
  if (!FEE_WALLET || sol <= 0 || !wallet.publicKey) return;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: FEE_WALLET,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    }),
  );
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");
}

export interface CreatePoolInput {
  tokenMint: string;
  tokenAmount: string; // whole tokens
  solAmount: string; // SOL
  feeConfigId: string;
  startNow: boolean;
  startTime?: Date;
}

export async function createPool(
  connection: Connection,
  wallet: WalletContextState,
  net: Network,
  input: CreatePoolInput,
) {
  const raydium = await initRaydium(connection, wallet, net);
  const { program, feeAcc } = programs(net);

  const mintPk = new PublicKey(input.tokenMint);
  const mintAcc = await connection.getAccountInfo(mintPk);
  if (!mintAcc) throw new Error("Token mint not found on this network");
  const tokenProgram = mintAcc.owner;
  const mintInfo = await getMint(connection, mintPk, "confirmed", tokenProgram);

  const tiers = await getFeeTiers(raydium, net);
  const feeConfig = tiers.find((t) => t.id === input.feeConfigId) ?? tiers[0];

  const mintA = { address: input.tokenMint, decimals: mintInfo.decimals, programId: tokenProgram.toBase58() };
  const mintB = { address: WSOL_MINT, decimals: 9, programId: TOKEN_PROGRAM_ID.toBase58() };

  const start = input.startNow || !input.startTime ? 0 : Math.floor(input.startTime.getTime() / 1000);

  // Platform fee first (separate tx so a failed pool doesn't leave the user wondering).
  await payPlatformFee(connection, wallet, FEES.createPool);

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: program,
    poolFeeAccount: feeAcc,
    mintA,
    mintB,
    mintAAmount: new BN(toBaseUnits(input.tokenAmount, mintInfo.decimals).toString()),
    mintBAmount: new BN(toBaseUnits(input.solAmount, 9).toString()),
    startTime: new BN(start),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
    computeBudgetConfig: { units: 600_000, microLamports: 100_000 },
  });

  const { txId } = await execute({ sendAndConfirm: true });
  return {
    signature: txId,
    poolId: extInfo.address.poolId.toBase58(),
    lpMint: extInfo.address.lpMint.toBase58(),
  };
}

export async function getPoolPosition(
  connection: Connection,
  wallet: WalletContextState,
  net: Network,
  poolId: string,
) {
  const raydium = await initRaydium(connection, wallet, net);
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const lpMint = new PublicKey(poolInfo.lpMint.address);
  const ata = getAssociatedTokenAddressSync(lpMint, wallet.publicKey!);
  let lpBalance = new BN(0);
  try {
    const bal = await connection.getTokenAccountBalance(ata);
    lpBalance = new BN(bal.value.amount);
  } catch {
    /* no LP account */
  }
  return { raydium, poolInfo, poolKeys, rpcData, lpBalance, lpDecimals: poolInfo.lpMint.decimals };
}

export async function removeLiquidity(
  connection: Connection,
  wallet: WalletContextState,
  net: Network,
  poolId: string,
  percent: number,
) {
  const { raydium, poolInfo, poolKeys, lpBalance } = await getPoolPosition(connection, wallet, net, poolId);
  if (lpBalance.isZero()) throw new Error("You hold no LP tokens for this pool");
  const lpAmount = lpBalance.muln(Math.round(percent * 100)).divn(10_000);
  if (lpAmount.isZero()) throw new Error("Amount too small");

  await payPlatformFee(connection, wallet, FEES.removeLiquidity);

  const { execute } = await raydium.cpmm.withdrawLiquidity({
    poolInfo,
    poolKeys,
    lpAmount,
    slippage: new Percent(1, 100),
    txVersion: TxVersion.V0,
    closeWsol: true,
    computeBudgetConfig: { units: 400_000, microLamports: 100_000 },
  });
  const { txId } = await execute({ sendAndConfirm: true });
  return txId;
}

/** Burn LP tokens so liquidity can never be pulled (common "rug-proof" signal). */
export async function burnLp(
  connection: Connection,
  wallet: WalletContextState,
  net: Network,
  poolId: string,
) {
  const { poolInfo, lpBalance, lpDecimals } = await getPoolPosition(connection, wallet, net, poolId);
  if (lpBalance.isZero()) throw new Error("You hold no LP tokens for this pool");
  const lpMint = new PublicKey(poolInfo.lpMint.address);
  const owner = wallet.publicKey!;
  const ata = getAssociatedTokenAddressSync(lpMint, owner);
  const tx = new Transaction().add(
    createBurnCheckedInstruction(ata, lpMint, owner, BigInt(lpBalance.toString()), lpDecimals),
  );
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
