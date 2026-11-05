export interface MetadataInput {
  name: string;
  symbol: string;
  description: string;
  image: File;
  website?: string;
  twitter?: string;
  telegram?: string;
}

const toBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

/** Uploads image + metadata JSON to IPFS via the /api/upload serverless function. Returns the metadata URI. */
export async function uploadMetadata(m: MetadataInput): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: m.name,
      symbol: m.symbol,
      description: m.description,
      website: m.website,
      twitter: m.twitter,
      telegram: m.telegram,
      imageName: m.image.name,
      imageType: m.image.type,
      imageBase64: await toBase64(m.image),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.uri) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.uri;
}
