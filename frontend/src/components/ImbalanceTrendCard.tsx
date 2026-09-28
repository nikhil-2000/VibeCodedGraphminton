import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ImbalanceTrendPoint } from '../types'

interface Props {
  data: ImbalanceTrendPoint[]
  loading: boolean
}

export default function ImbalanceTrendCard({ data, loading }: Props) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Fixture Imbalance Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cumulative Σdeviation² across all player pairs — lower means more uniform fixture distribution.
        </p>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && data.length === 0 && (
          <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        )}
        {!loading && data.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="played_on"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v: string) => v.slice(5)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--foreground)', marginBottom: 4 }}
                itemStyle={{ color: 'var(--foreground)' }}
                formatter={(value) => typeof value === 'number' ? value.toFixed(1) : value}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => value === 'partnership_score' ? 'Partnerships' : 'Head-to-Head'}
              />
              <Line
                type="monotone"
                dataKey="partnership_score"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="head_to_head_score"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
