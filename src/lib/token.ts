import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  AuthorityType,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { FEE_WALLET, FEES } from "../config";

export interface CreateTokenInput {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  supply: string; // whole tokens, as string to avoid float issues
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
}

export function totalFee(i: Pick<CreateTokenInput, "revokeMint" | "revokeFreeze" | "revokeUpdate">) {
  if (!FEE_WALLET) return 0;
  return (
    FEES.createToken +
    (i.revokeMint ? FEES.revokeMint : 0) +
    (i.revokeFreeze ? FEES.revokeFreeze : 0) +
    (i.revokeUpdate ? FEES.revokeUpdate : 0)
  );
}

/** supply * 10^decimals as bigint, without floating point. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const f = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(f || "0");
}

export async function createToken(
  connection: Connection,
  wallet: WalletContextState,
  input: CreateTokenInput,
): Promise<{ mint: PublicKey; signature: string }> {
  const owner = wallet.publicKey;
  if (!owner || !wallet.sendTransaction) throw new Error("Connect a wallet first");

  const amount = toBaseUnits(input.supply, input.decimals);
  if (amount <= 0n) throw new Error("Supply must be greater than 0");
  if (amount > 18_446_744_073_709_551_615n) throw new Error("Supply × 10^decimals exceeds the u64 limit");

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  const rent = await getMinimumBalanceForRentExemptMint(connection);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint, input.decimals, owner, owner),
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint),
    createMintToInstruction(mint, ata, owner, amount),
    createCreateMetadataAccountV3Instruction(
      { metadata: metadataPda, mint, mintAuthority: owner, payer: owner, updateAuthority: owner },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: input.name,
            symbol: input.symbol,
            uri: input.uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          // "Revoke update authority" = make metadata immutable forever.
          isMutable: !input.revokeUpdate,
          collectionDetails: null,
        },
      },
    ),
  );

  if (input.revokeMint) tx.add(createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null));
  if (input.revokeFreeze) tx.add(createSetAuthorityInstruction(mint, owner, AuthorityType.FreezeAccount, null));

  const fee = totalFee(input);
  if (FEE_WALLET && fee > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: FEE_WALLET,
        lamports: Math.round(fee * LAMPORTS_PER_SOL),
      }),
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  const signature = await wallet.sendTransaction(tx, connection, { signers: [mintKp] });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { mint, signature };
}
