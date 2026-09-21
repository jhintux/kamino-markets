import { NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot, getWalletBalances } from "@/lib/kamino";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  try {
    const market = await getMarketSnapshot();
    const balances = await getWalletBalances(
      wallet,
      market.reserves.map((reserve) => reserve.mint)
    );
    return NextResponse.json({ balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load balances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
