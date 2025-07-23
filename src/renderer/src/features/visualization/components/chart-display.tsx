'use client'

import React from 'react'
// Removed DisplayChartPayload import from ipc-types as it's no longer used for this component
// The props will be defined directly here, matching the tool result structure.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  Treemap,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadialBarChart,
  RadialBar
} from 'recharts'

// Define and export the props for ChartDisplay
// This structure should match the object returned by the display_chart tool in LlmToolService
export interface ChartDisplayData {
  chartId: string
  chartType:
    | 'bar'
    | 'line'
    | 'pie'
    | 'area'
    | 'scatter'
    | 'radar'
    | 'radialBar'
    | 'donut'
    | 'treemap'
  data: Record<string, any>[]
  config: Record<string, any> // Contains specific config like xAxisKey, yAxisKeys, nameKey, valueKey, etc.
}

export interface ChartDisplayProps {
  chartData: ChartDisplayData
  onClose?: () => void // Retained if it might be used for other embedding contexts later
}

// Config interfaces remain internal to this component for now
interface CategoryChartConfig {
  title?: string
  legend?: boolean
  colors?: string[]
  xAxisKey: string
  yAxisKeys: string[]
  xAxisLabel?: string
  yAxisLabel?: string
}

interface PieDonutChartConfig {
  title?: string
  legend?: boolean
  colors?: string[]
  nameKey: string
  valueKey: string
  innerRadiusRatio?: number
}

interface TreemapChartConfig {
  title?: string
  legend?: boolean
  colors?: string[]
  nameKey: string
  valueKey: string
}

interface RadarChartConfig {
  title?: string
  legend?: boolean
  colors?: string[]
  angleKey: string // The key for the data points on the angular axis (e.g., subject)
  valueKeys: string[] // Keys for the values to be plotted for each angle (e.g., studentA, studentB)
  label?: string // Optional label for the radar spokes
}

interface RadialBarChartConfig {
  title?: string
  legend?: boolean
  colors?: string[]
  nameKey: string // Key for the name of each bar segment
  valueKey: string // Key for the value of each bar segment
  background?: boolean | object // Show background circle or specify its props
}

const DEFAULT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-9)',
  'var(--chart-10)'
]

const ChartDisplay: React.FC<ChartDisplayProps> = ({ chartData, onClose }) => {
  const { chartId, chartType, data, config: rawConfig } = chartData

  console.log(`[ChartDisplay] Rendering chart ${chartId} of type ${chartType}:`, {
    data,
    rawConfig
  })

  // Custom content renderer for Treemap to handle colors and text
  const TreemapCustomContent = (props: any) => {
    const { depth, x, y, width, height, index, name, value, colors } = props
    const color =
      colors?.[index % colors?.length || 0] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: 'var(--background)',
            strokeWidth: 2 / (depth + 1e-10),
            strokeOpacity: 1 / (depth + 1e-10)
          }}
        />
        {width * height > 2000 && width > 80 && height > 25 ? ( // Only display text if the box is large enough
          <text
            x={x + width / 2}
            y={y + height / 2 + 7}
            textAnchor="middle"
            fill="var(--primary-foreground)"
            fontSize={14}
            fontWeight={500}
          >
            {name}
          </text>
        ) : null}
        {width * height > 1000 && width > 60 && height > 40 ? ( // Display value if box is reasonably large
          <text
            x={x + width / 2}
            y={y + height / 2 + 24} // Position value below name
            textAnchor="middle"
            fill="var(--primary-foreground)"
            fontSize={12}
          >
            ({value})
          </text>
        ) : null}
      </g>
    )
  }

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        const barConfig = rawConfig as CategoryChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={barConfig.xAxisKey}
                angle={barConfig.xAxisKey && data.length > 5 ? -45 : 0}
                textAnchor={barConfig.xAxisKey && data.length > 5 ? 'end' : 'middle'}
                minTickGap={0}
                height={barConfig.xAxisKey && data.length > 5 ? 70 : 30}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: barConfig.xAxisLabel,
                  position: 'insideBottom',
                  dy: 20,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: barConfig.yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  dx: -10,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {barConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
              {barConfig.yAxisKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={
                    barConfig.colors?.[index % barConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )
      case 'line':
        const lineConfig = rawConfig as CategoryChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={lineConfig.xAxisKey}
                angle={lineConfig.xAxisKey && data.length > 5 ? -45 : 0}
                textAnchor={lineConfig.xAxisKey && data.length > 5 ? 'end' : 'middle'}
                minTickGap={0}
                height={lineConfig.xAxisKey && data.length > 5 ? 70 : 30}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: lineConfig.xAxisLabel,
                  position: 'insideBottom',
                  dy: 20,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: lineConfig.yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  dx: -10,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {lineConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
              {lineConfig.yAxisKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={
                    lineConfig.colors?.[index % lineConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )
      case 'pie':
      case 'donut':
        const pieConfig = rawConfig as PieDonutChartConfig
        const outerRadius = chartType === 'donut' ? 100 : 120
        const innerRadius =
          chartType === 'donut' ? outerRadius * (pieConfig.innerRadiusRatio ?? 0.5) : 0
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={pieConfig.legend !== false}
                label={({ name, percent }) =>
                  pieConfig.legend === false ? `${name} (${(percent * 100).toFixed(0)}%)` : null
                }
                outerRadius={outerRadius}
                innerRadius={innerRadius}
                fill="#8884d8"
                dataKey={pieConfig.valueKey}
                nameKey={pieConfig.nameKey}
              >
                {data.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      pieConfig.colors?.[index % pieConfig.colors.length] ||
                      DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {pieConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
            </PieChart>
          </ResponsiveContainer>
        )
      case 'area':
        const areaConfig = rawConfig as CategoryChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={areaConfig.xAxisKey}
                angle={areaConfig.xAxisKey && data.length > 5 ? -45 : 0}
                textAnchor={areaConfig.xAxisKey && data.length > 5 ? 'end' : 'middle'}
                minTickGap={0}
                height={areaConfig.xAxisKey && data.length > 5 ? 70 : 30}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: areaConfig.xAxisLabel,
                  position: 'insideBottom',
                  dy: 20,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: areaConfig.yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  dx: -10,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {areaConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
              {areaConfig.yAxisKeys.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={
                    areaConfig.colors?.[index % areaConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                  fillOpacity={0.6}
                  fill={
                    areaConfig.colors?.[index % areaConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )
      case 'scatter':
        const scatterConfig = rawConfig as CategoryChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey={scatterConfig.xAxisKey}
                name={scatterConfig.xAxisLabel || scatterConfig.xAxisKey}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: scatterConfig.xAxisLabel,
                  position: 'insideBottom',
                  dy: 20,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <YAxis
                type="number"
                name={scatterConfig.yAxisLabel || scatterConfig.yAxisKeys[0] || 'Value'}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                label={{
                  value: scatterConfig.yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  dx: -10,
                  fontSize: 14,
                  fontWeight: 'bold',
                  fill: 'var(--foreground)'
                }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {scatterConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
              {scatterConfig.yAxisKeys.map((yKey, index) => (
                <Scatter
                  key={yKey}
                  name={yKey}
                  dataKey={yKey}
                  fill={
                    scatterConfig.colors?.[index % scatterConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )
      case 'radar':
        const radarConfig = rawConfig as RadarChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius="80%"
              data={data}
              margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
            >
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey={radarConfig.angleKey}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 'auto']}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
              {radarConfig.valueKeys.map((key, index) => (
                <Radar
                  key={key}
                  name={key}
                  dataKey={key}
                  stroke={
                    radarConfig.colors?.[index % radarConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                  fill={
                    radarConfig.colors?.[index % radarConfig.colors.length] ||
                    DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                  }
                  fillOpacity={0.6}
                />
              ))}
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {radarConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
            </RadarChart>
          </ResponsiveContainer>
        )
      case 'radialBar':
        const radialBarConfig = rawConfig as RadialBarChartConfig
        const radialData = data.map((item, index) => ({
          name: item[radialBarConfig.nameKey],
          value: item[radialBarConfig.valueKey],
          fill:
            radialBarConfig.colors?.[index % radialBarConfig.colors.length] ||
            DEFAULT_COLORS[index % DEFAULT_COLORS.length]
        }))

        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="20%"
              outerRadius="80%"
              barSize={10}
              data={radialData}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar
                label={{ position: 'insideStart', fill: 'var(--primary-foreground)' }}
                background={
                  radialBarConfig.background
                    ? typeof radialBarConfig.background === 'object'
                      ? radialBarConfig.background
                      : { fill: 'var(--muted)' }
                    : false
                }
                dataKey="value"
              >
                {radialData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </RadialBar>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)'
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              {radialBarConfig.legend !== false && (
                <Legend wrapperStyle={{ color: 'var(--muted-foreground)', paddingTop: 24 }} />
              )}
            </RadialBarChart>
          </ResponsiveContainer>
        )
      case 'treemap':
        const treemapConfig = rawConfig as TreemapChartConfig
        return (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey={treemapConfig.valueKey}
              nameKey={treemapConfig.nameKey}
              aspectRatio={4 / 3}
              stroke="var(--background)"
              fill="var(--primary)"
              isAnimationActive={false}
              content={<TreemapCustomContent colors={treemapConfig.colors || DEFAULT_COLORS} />}
            />
          </ResponsiveContainer>
        )
      default:
        console.warn(`[ChartDisplay] Unknown chart type: ${chartType}`)
        return (
          <div>
            Unsupported chart type: {chartType} for ID: {chartId}
          </div>
        )
    }
  }

  return (
    <div className="p-4 bg-popover border border-border/50 rounded-lg shadow-none w-full flex flex-col mb-6">
      {/* Title is now handled by DialogHeader in ChartManager, but can be a fallback here if needed */}
      {/* {rawConfig.title && <h2 className="text-xl font-semibold mb-4 text-center">{rawConfig.title}</h2>} */}
      <div className="w-full h-[300px] sm:h-[350px] md:h-[400px]">{renderChart()}</div>
      {/* Close button is removed here as DialogClose in ChartManager or default dialog close is preferred */}
    </div>
  )
}

export default ChartDisplay
