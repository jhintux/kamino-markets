import { NextRequest, NextResponse } from "next/server";
import { buildMarketAction } from "@/lib/transactions";
import type { ActionKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<ActionKind>(["supply", "withdraw", "borrow", "repay"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallet = String(body.wallet ?? "");
    const reserveAddress = String(body.reserveAddress ?? "");
    const amount = String(body.amount ?? "");
    const action = body.action as ActionKind;
    const max = Boolean(body.max);

    if (!wallet || !reserveAddress || !ACTIONS.has(action)) {
      return NextResponse.json({ error: "wallet, reserveAddress and action are required" }, { status: 400 });
    }
    if (!max && !amount) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }

    const transactions = await buildMarketAction({
      wallet,
      reserveAddress,
      amount,
      action,
      max,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build transaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
