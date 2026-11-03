import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ApiError } from "../../../api/client";
import type { FindingSeverity, OpenFindingCounts } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge";
import { severityChartColors } from "../../../lib/chartColors";
import { formatNumber } from "../../../lib/format";
import { findingSeverityLabels } from "../../../lib/labels";
import { DashboardSection } from "./DashboardSection";

interface OpenFindingsPanelProps {
  data: OpenFindingCounts | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  className?: string;
}

const SEVERITIES: FindingSeverity[] = ["low", "medium", "high", "critical"];

export function OpenFindingsPanel({
  data,
  loading,
  error,
  onRetry,
  className,
}: OpenFindingsPanelProps) {
  const chartData = SEVERITIES.map((severity) => ({
    severity,
    label: findingSeverityLabels[severity],
    value: data?.[severity] ?? 0,
    fill: severityChartColors[severity],
  }));
  const summary = chartData
    .map((row) => `${row.label} ${formatNumber(row.value)}`)
    .join(", ");

  return (
    <DashboardSection
      title="Unresolved findings"
      description="Open or in progress, by finding severity."
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={!data || data.total === 0}
      emptyTitle="No unresolved findings at this date"
      emptyDescription="Findings that are still open or in progress will appear here."
      skeletonRows={4}
    >
      {data && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums text-slate-950">
              {formatNumber(data.total)}
            </p>
            <Badge tone="critical">{formatNumber(data.critical)} critical</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Resolved and accepted findings are excluded.
          </p>

          <div
            role="img"
            aria-label={`Unresolved findings by severity: ${summary}.`}
            className="mt-4 h-56 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  width={32}
                />
                <Tooltip />
                <Bar dataKey="value" name="Findings" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {chartData.map((row) => (
                    <Cell key={row.severity} fill={row.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    fontSize={12}
                    fill="#334155"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            These counts are context and do not add risk points.
          </p>
        </>
      )}
    </DashboardSection>
  );
}
