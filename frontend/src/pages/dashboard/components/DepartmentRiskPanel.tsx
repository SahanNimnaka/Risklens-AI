import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ApiError } from "../../../api/client";
import type { DepartmentSummary, RiskBand } from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import {
  chartAxisColor,
  chartGridColor,
  riskBandChartColors,
} from "../../../lib/chartColors";
import { departmentLabels } from "../../../lib/labels";
import { DashboardSection } from "./DashboardSection";

interface DepartmentRiskPanelProps {
  data: DepartmentSummary[] | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  className?: string;
}

interface ChartRow {
  department: string;
  label: string;
  score: number;
  band: RiskBand;
}

const BAND_ORDER: RiskBand[] = ["low", "medium", "high", "critical"];

const bandLabels: Record<RiskBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function DepartmentRiskPanel({
  data,
  loading,
  error,
  onRetry,
  className,
}: DepartmentRiskPanelProps) {
  const chartData: ChartRow[] = (data ?? []).map((item) => ({
    department: item.department,
    label: departmentLabels[item.department],
    score: item.score,
    band: item.band,
  }));
  const presentBands = BAND_ORDER.filter((band) =>
    chartData.some((row) => row.band === band),
  );
  const summary = chartData
    .map((row) => `${row.label} ${formatNumber(row.score)}`)
    .join(", ");

  return (
    <DashboardSection
      title="Department risk"
      description="Score by department, highest first."
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={chartData.length === 0}
      emptyTitle="No department scores at this date"
      emptyDescription="No department has a deterministic risk result for the selected evaluation date."
      skeletonRows={5}
    >
      <div
        role="img"
        aria-label={`Department risk scores: ${summary}.`}
        className="h-72 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 28, bottom: 4, left: 4 }}
          >
            <CartesianGrid horizontal={false} stroke={chartGridColor} />
            <XAxis
              type="number"
              tickFormatter={(value: number) => formatNumber(value)}
              stroke={chartAxisColor}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={112}
              stroke={chartAxisColor}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Bar dataKey="score" name="Risk score" barSize={16} radius={[0, 4, 4, 0]}>
              {chartData.map((row) => (
                <Cell
                  key={row.department}
                  fill={riskBandChartColors[row.band]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {presentBands.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: riskBandChartColors[band] }}
              aria-hidden="true"
            />
            {bandLabels[band]} band
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}
