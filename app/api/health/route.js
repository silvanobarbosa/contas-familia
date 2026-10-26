import { NextResponse } from "next/server";

// Monitor sintetico da frota. Publico, sem segredo, resposta rapida.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, app: "contas-familia", at: new Date().toISOString() });
}
