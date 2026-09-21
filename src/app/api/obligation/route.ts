import { NextRequest, NextResponse } from "next/server";
import { getObligationSnapshot } from "@/lib/kamino";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  try {
    const obligation = await getObligationSnapshot(wallet);
    return NextResponse.json({ obligation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load obligation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
