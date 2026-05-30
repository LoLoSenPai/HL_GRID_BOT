export function ProgressBar({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  const width = `${Math.max(0, Math.min(value, 100))}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="metric-mono">{caption}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-muted">
        <div className="h-full rounded-sm bg-primary" style={{ width }} />
      </div>
    </div>
  );
}
