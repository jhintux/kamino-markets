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
        hint: "Public Solana RPCs often rate-limit reserve scans. Set SOLANA_RPC_URL to a dedicated endpoint.",
      },
      { status: 500 }
    );
  }
}
