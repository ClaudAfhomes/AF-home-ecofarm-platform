export type ChartMetric = 'salesCreated' | 'verifiedSales' | 'collectedAmount' | 'totalCollectedAmount';

const metricLabels: Record<ChartMetric, string> = {
  salesCreated: 'Sales created',
  verifiedSales: 'Verified sales',
  collectedAmount: 'Collected in period',
  totalCollectedAmount: 'Total collected',
};

export function chartMetricLabel(metric: ChartMetric) {
  return metricLabels[metric];
}
