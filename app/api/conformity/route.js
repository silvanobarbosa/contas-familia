import { NextResponse } from "next/server";
import conformity from "../../../conformity.json" with { type: "json" };

// Reporta o baseline que ESTE app cumpre. O drift-check da frota le isto + os
// headers live e compara. Publico (monitoramento).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    templateVersion: conformity.templateVersion,
    baseline: conformity.baseline,
    app: process.env.APP_NAME || "contas-familia",
    reportedAt: new Date().toISOString(),
  });
}
