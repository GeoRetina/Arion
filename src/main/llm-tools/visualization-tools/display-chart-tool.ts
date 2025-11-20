import { z } from 'zod'

export const displayChartToolName = 'display_chart'

const baseChartConfigSchema = z.object({
  title: z.string().optional().describe('The title of the chart.'),
  legend: z.boolean().optional().default(true).describe('Whether to display the chart legend.'),
  colors: z
    .array(z.string())
    .optional()
    .describe("Optional array of hex color codes for chart elements (e.g., ['#FF5733', '#33FF57'])")
})

const categoryChartConfigSchema = baseChartConfigSchema.extend({
  xAxisKey: z
    .string()
    .describe('The key in each data object that represents the x-axis category or value.'),
  yAxisKeys: z
    .array(z.string())
    .min(1)
    .describe(
      'An array of keys in each data object for y-axis values. Allows for multiple series (e.g., multiple lines or bar groups).'
    ),
  xAxisLabel: z.string().optional().describe('Optional label for the x-axis.'),
  yAxisLabel: z.string().optional().describe('Optional label for the y-axis.')
})

const pieChartConfigSchema = baseChartConfigSchema.extend({
  nameKey: z
    .string()
    .describe('The key in each data object that represents the name of the pie slice.'),
  valueKey: z
    .string()
    .describe('The key in each data object that represents the value of the pie slice.')
})

// New Config Schemas for additional chart types
const radarChartConfigSchema = baseChartConfigSchema.extend({
  angleKey: z
    .string()
    .describe(
      'The key in each data object for the category/axis labels around the radar (e.g., "subject").'
    ),
  valueKeys: z
    .array(z.string())
    .min(1)
    .describe(
      'An array of keys for the values along each axis for different series (e.g., ["studentA_score", "studentB_score"]).'
    )
})

const radialBarChartConfigSchema = baseChartConfigSchema.extend({
  nameKey: z
    .string()
    .describe(
      'The key in each data object for the label of each radial bar segment (e.g., "category").'
    ),
  valueKey: z
    .string()
    .describe(
      'The key in each data object for the value determining the bar length (e.g., "percentage").'
    )
})

const donutChartConfigSchema = pieChartConfigSchema.extend({
  innerRadiusRatio: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe(
      'Ratio of the inner radius to the outer radius for the donut hole (e.g., 0.5 for 50% hole). Default is 0.5.'
    )
})

const treemapChartConfigSchema = baseChartConfigSchema.extend({
  nameKey: z
    .string()
    .describe(
      'The key in each data object for the label of each rectangle in the treemap (e.g., "name").'
    ),
  valueKey: z
    .string()
    .describe(
      'The key in each data object for the numerical value determining the size of the rectangle (e.g., "size").'
    )
  // childrenKey: z.string().optional().describe('Optional key for nested data if using hierarchical treemaps. Data should be structured accordingly.')
})

// Define a more specific schema for items within the data array
const dataItemSchema = z
  .object({
    name: z
      .string()
      .optional()
      .describe('An optional common field for a category, label, or item name.'),
    value: z
      .any()
      .optional()
      .describe(
        'An optional common field for a numerical or other primary value associated with the item.'
      ),
    group: z
      .string()
      .optional()
      .describe('An optional common field for grouping data, often used for series in charts.')
  })
  .catchall(z.any())
  .describe(
    "Schema for individual data objects within the 'data' array. Allows for common optional fields like 'name', 'value', 'group', and any other custom fields required by the specific chart data."
  )

const scatterChartConfigSchema = baseChartConfigSchema.extend({
  xKey: z
    .string()
    .optional()
    .describe('Optional key for x values; defaults to reading raw "x" data if omitted.'),
  yKey: z
    .string()
    .optional()
    .describe('Optional key for y values; defaults to reading raw "y" data if omitted.'),
  xAxisLabel: z.string().optional().describe('Optional label shown on the x-axis.'),
  yAxisLabel: z.string().optional().describe('Optional label shown on the y-axis.')
})

const baseConfigByType: Record<
  'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'radar' | 'radialBar' | 'donut' | 'treemap',
  z.ZodTypeAny
> = {
  bar: categoryChartConfigSchema,
  line: categoryChartConfigSchema,
  area: categoryChartConfigSchema,
  scatter: scatterChartConfigSchema,
  pie: pieChartConfigSchema,
  radar: radarChartConfigSchema,
  radialBar: radialBarChartConfigSchema,
  donut: donutChartConfigSchema,
  treemap: treemapChartConfigSchema
}

export const displayChartToolParamsSchema = z
  .object({
    chartType: z
      .enum(['bar', 'line', 'pie', 'area', 'scatter', 'radar', 'radialBar', 'donut', 'treemap'])
      .describe(
        "The type of chart to display. Supported types: 'bar', 'line', 'pie', 'area', 'scatter', 'radar', 'radialBar', 'donut', 'treemap'."
      ),
    data: z
      .array(dataItemSchema)
      .min(1)
      .describe(
        'An array of data objects to plot. Each object is a record (key-value pairs). Example for bar/line: [{ "month": "Jan", "sales": 1000, "expenses": 400 }, ...]. Example for pie: [{ "category": "Electronics", "amount": 500 }, ...].'
      ),
    config: baseChartConfigSchema.extend({
      axis: z
        .object({
          xKey: z.string().optional().describe('Optional key name to use for x-axis values.'),
          yKey: z.string().optional().describe('Optional key name to use for y-axis values.'),
          xLabel: z.string().optional().describe('Label for the x-axis.'),
          yLabel: z.string().optional().describe('Label for the y-axis.')
        })
        .optional()
        .describe('Optional axis helper for simple scatter or custom charts.'),
      valueKeys: z
        .array(z.string())
        .optional()
        .describe('Optional helper to specify value keys for multi-series charts.')
    })
  })
  .superRefine((value, ctx) => {
    const schema = baseConfigByType[value.chartType]

    if (!schema) return

    let configToValidate = value.config

    if (value.chartType === 'scatter') {
      const axis = value.config.axis || {}
      const scatterConfig = {
        ...value.config,
        xKey: axis.xKey,
        yKey: axis.yKey,
        xAxisLabel: axis.xLabel,
        yAxisLabel: axis.yLabel
      }
      configToValidate = scatterConfig
    } else if (['bar', 'line', 'area'].includes(value.chartType)) {
      configToValidate = {
        ...value.config,
        xAxisKey: value.config.axis?.xKey ?? value.config.xAxisKey,
        yAxisKeys: value.config.valueKeys ?? value.config.yAxisKeys
      }
    }

    const parsed = schema.safeParse(configToValidate)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue(issue)
      }
    } else {
      value.config = parsed.data
    }
  })
  .describe(
    'A tool to display various types of charts based on provided data and configuration. The renderer process will handle the actual chart rendering.'
  )

export type DisplayChartParams = z.infer<typeof displayChartToolParamsSchema>

export const displayChartToolDefinition = {
  description: displayChartToolName, // Vercel AI SDK uses this field for description
  inputSchema: displayChartToolParamsSchema
}

// Example of how to refine the schema for discriminated union if needed, though Zod handles it well.
// This is more for conceptual understanding or if further type safety is needed in consuming code.
// export const displayChartToolParamsSchemaRefined = z.discriminatedUnion('chartType', [
//   z.object({ chartType: z.literal('bar'), data: z.array(z.record(z.string(), z.any())), config: categoryChartConfigSchema }),
//   z.object({ chartType: z.literal('line'), data: z.array(z.record(z.string(), z.any())), config: categoryChartConfigSchema }),
//   z.object({ chartType: z.literal('area'), data: z.array(z.record(z.string(), z.any())), config: categoryChartConfigSchema }),
//   z.object({ chartType: z.literal('scatter'), data: z.array(z.record(z.string(), z.any())), config: categoryChartConfigSchema }),
//   z.object({ chartType: z.literal('pie'), data: z.array(z.record(z.string(), z.any())), config: pieChartConfigSchema }),
// ]);
// export type DisplayChartParamsRefined = z.infer<typeof displayChartToolParamsSchemaRefined>;

/*
Example Usage by LLM:

1. Bar Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "bar",
    "data": [
      { "city": "New York", "population": 8.4, "area": 783.8 },
      { "city": "Los Angeles", "population": 3.9, "area": 1213.9 },
      { "city": "Chicago", "population": 2.7, "area": 589.7 }
    ],
    "config": {
      "title": "City Populations",
      "xAxisKey": "city",
      "yAxisKeys": ["population"],
      "yAxisLabel": "Population (Millions)",
      "colors": ["#8884d8"]
    }
  }
}

2. Line Chart with Multiple Lines:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "line",
    "data": [
      { "year": 2020, "productA_sales": 100, "productB_sales": 120 },
      { "year": 2021, "productA_sales": 150, "productB_sales": 130 },
      { "year": 2022, "productA_sales": 120, "productB_sales": 160 }
    ],
    "config": {
      "title": "Product Sales Over Years",
      "xAxisKey": "year",
      "yAxisKeys": ["productA_sales", "productB_sales"],
      "yAxisLabel": "Sales ($)",
      "colors": ["#82ca9d", "#ffc658"]
    }
  }
}

3. Pie Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "pie",
    "data": [
      { "source": "Solar", "energy_produced_gwh": 450 },
      { "source": "Wind", "energy_produced_gwh": 380 },
      { "source": "Hydro", "energy_produced_gwh": 290 }
    ],
    "config": {
      "title": "Energy Production by Source",
      "nameKey": "source",
      "valueKey": "energy_produced_gwh",
      "colors": ["#0088FE", "#00C49F", "#FFBB28"]
    }
  }
}

4. Radar Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "radar",
    "data": [
      { "subject": "Math", "studentA": 85, "studentB": 70, "avg": 78 },
      { "subject": "Science", "studentA": 90, "studentB": 80, "avg": 85 },
      { "subject": "English", "studentA": 75, "studentB": 85, "avg": 80 },
      { "subject": "History", "studentA": 80, "studentB": 75, "avg": 77 }
    ],
    "config": {
      "title": "Student Performance Comparison",
      "angleKey": "subject",
      "valueKeys": ["studentA", "studentB", "avg"],
      "colors": ["#8884d8", "#82ca9d", "#ffc658"]
    }
  }
}

5. Radial Bar Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "radialBar",
    "data": [
      { "name": "Category A", "value": 75, "fill": "#8884d8" },
      { "name": "Category B", "value": 60, "fill": "#83a6ed" },
      { "name": "Category C", "value": 45, "fill": "#8dd1e1" },
      { "name": "Category D", "value": 30, "fill": "#82ca9d" }
    ],
    "config": {
      "title": "Progress by Category",
      "nameKey": "name",
      "valueKey": "value"
      // Colors can be specified in data or via global config.colors
    }
  }
}

6. Donut Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "donut",
    "data": [
      { "item": "Laptops", "count": 320 },
      { "item": "Desktops", "count": 150 },
      { "item": "Tablets", "count": 200 }
    ],
    "config": {
      "title": "Device Sales Distribution",
      "nameKey": "item",
      "valueKey": "count",
      "innerRadiusRatio": 0.6,
      "colors": ["#0088FE", "#00C49F", "#FFBB28"]
    }
  }
}

7. Treemap Chart:
{
  "tool_name": "display_chart",
  "tool_arguments": {
    "chartType": "treemap",
    "data": [
      { "name": "Electronics", "size": 2000 },
      { "name": "Clothing", "size": 1500 },
      { "name": "Books", "size": 1000 },
      { "name": "Home Goods", "size": 1200 }
    ],
    "config": {
      "title": "Product Category Revenue",
      "nameKey": "name",
      "valueKey": "size",
      "colors": ["#8884d8", "#82ca9d", "#ffc658", "#a4de6c"]
    }
  }
}
*/
