export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

export function requireToken(req: Request, expected: string): Response | null {
  const token = bearerToken(req);
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  return null;
}
