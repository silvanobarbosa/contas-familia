import { auth } from "../../lib/generated/ui.mjs";
import { html } from "../../lib/http.mjs";
export const dynamic = "force-static";
export function GET() { return html(auth); }
