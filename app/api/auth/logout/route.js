import { NextResponse } from "next/server";
import { COOKIE, cookieOpts } from "../../../../lib/auth.mjs";
export const runtime = "nodejs";
export async function POST() { const res = NextResponse.json({ ok: true }); res.cookies.set(COOKIE, "", { ...cookieOpts, maxAge: 0 }); return res; }
