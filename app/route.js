import { app } from "../lib/generated/ui.mjs";
import { html } from "../lib/http.mjs";
export const dynamic = "force-dynamic";
export function GET() { return html(app); }
