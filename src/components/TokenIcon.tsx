"use client";

import { useState } from "react";

const TONES: Record<string, string> = {
  eUSX: "from-orange-400 to-amber-600",
  USX: "from-violet-400 to-fuchsia-600",
  USDC: "from-sky-400 to-blue-600",
  USDG: "from-emerald-300 to-teal-600",
  PT: "from-emerald-400 to-green-700",
};

export function TokenIcon({
  symbol,
  logoUrl,
  size = 28,
}: {
  symbol: string;
  logoUrl?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const tone =
    TONES[symbol] ||
    (symbol.startsWith("PT") ? TONES.PT : "from-slate-400 to-slate-700");

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="rounded-full shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${tone} text-[10px] font-bold text-white shrink-0`}
      style={{ width: size, height: size }}
    >
      {symbol.replace("PT-", "").slice(0, 2)}
    </span>
  );
}
