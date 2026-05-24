type Props = {
  color?: "amber" | "emerald" | "red" | "neutral";
  children: React.ReactNode;
};

const colors = {
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
};

export function Pill({ color = "neutral", children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs border ${colors[color]}`}
    >
      {children}
    </span>
  );
}
