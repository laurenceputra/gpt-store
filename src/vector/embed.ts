export async function embedText(env: { AI?: Ai }, text: string): Promise<number[] | null> {
  if (!env.AI) return null;
  try {
    const out = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [text] });
    const vectors = (out as { data?: number[][] }).data;
    return vectors?.[0] ?? null;
  } catch {
    return null;
  }
}
