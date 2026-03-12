// Mini bar chart — 7 bars, last 2 colored, used in KPI cards

interface MiniBarsProps {
  bars: number[];
  color: string;
  light: string;
}

export default function MiniBars({ bars, color, light }: MiniBarsProps) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 36 }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-[3px]"
          style={{
            height: `${b}%`,
            background: i >= 5 ? color : light,
            minHeight: 3,
          }}
        />
      ))}
    </div>
  );
}
