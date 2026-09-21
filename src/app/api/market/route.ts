import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/kamino";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const market = await getMarketSnapshot();
    return NextResponse.json(market);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load market";
    return NextResponse.json(
      {
        error: message,
        hint: "The RPC rejected this request. Check SOLANA_RPC_URL and retry; skipped slots on Helius can 500 once, then succeed.",
      },
      { status: 500 }
    );
  }
}
