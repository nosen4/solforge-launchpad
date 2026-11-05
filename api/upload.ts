// Vercel serverless function: pins the token image + metadata JSON to IPFS via Pinata.
// Set PINATA_JWT (and optionally PINATA_GATEWAY, e.g. "yourname.mypinata.cloud") in your Vercel env vars.
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // keep under Vercel's 4.5 MB body limit
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return res.status(500).json({ error: "Server missing PINATA_JWT" });
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

  try {
    const { name, symbol, description, website, twitter, telegram, imageName, imageType, imageBase64 } =
      req.body ?? {};
    if (!name || !symbol || !imageBase64) return res.status(400).json({ error: "name, symbol and image required" });
    if (!ALLOWED.includes(imageType)) return res.status(400).json({ error: "Image must be PNG, JPG, GIF or WEBP" });

    const bytes = Buffer.from(imageBase64, "base64");
    if (bytes.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "Image must be under 3 MB" });

    // 1) image
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: imageType }), imageName || "image.png");
    form.append("pinataMetadata", JSON.stringify({ name: `${symbol}-image` }));
    const imgRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!imgRes.ok) throw new Error(`Image pin failed: ${await imgRes.text()}`);
    const imageUri = `https://${gateway}/ipfs/${(await imgRes.json()).IpfsHash}`;

    // 2) metadata JSON (Metaplex fungible standard + common social fields)
    const metadata = {
      name: String(name).slice(0, 32),
      symbol: String(symbol).slice(0, 10),
      description: description || "",
      image: imageUri,
      ...(website || twitter || telegram
        ? { extensions: { website, twitter, telegram }, website, twitter, telegram }
        : {}),
      properties: { files: [{ uri: imageUri, type: imageType }], category: "image" },
    };
    const jsonRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${symbol}-metadata` } }),
    });
    if (!jsonRes.ok) throw new Error(`Metadata pin failed: ${await jsonRes.text()}`);
    const uri = `https://${gateway}/ipfs/${(await jsonRes.json()).IpfsHash}`;

    return res.status(200).json({ uri, image: imageUri });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "4.5mb" } } };
