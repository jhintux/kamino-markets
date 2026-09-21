"use client";

export function HealthBar({ ltv, liquidationLtv }: { ltv: number; liquidationLtv: number }) {
  const liq = Math.max(liquidationLtv, 0.01);
  const currentPct = Math.min(100, Math.max(0, (ltv / liq) * 100));
  const markerPct = Math.min(100, Math.max(0, ltv * 100));
  const liqMarkerPct = Math.min(100, Math.max(0, liquidationLtv * 100));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span>Loan Health</span>
      </div>
      <div className="relative h-2 rounded-full bg-[#1b2434]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-400 to-emerald-300"
          style={{ width: `${currentPct}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `calc(${markerPct}% - 6px)` }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-orange-400 shadow"
          style={{ left: `calc(${liqMarkerPct}% - 6px)` }}
        />
      </div>
    </div>
  );
}
