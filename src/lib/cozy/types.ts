export type CozyDataQuality =
  | "ACTUAL"
  | "THEORETICAL"
  | "SIMULATED"
  | "ESTIMATED"
  | "MISSING";

export type CozyAlertLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CozyMetric {
  label: string;
  value: string;
  note: string;
  quality: CozyDataQuality;
}

export interface CozyVariance {
  code: string;
  name: string;
  theoretical: string;
  actual: string;
  variance: string;
  percent: string;
  level: CozyAlertLevel;
}

export interface CozyAction {
  priority: string;
  title: string;
  detail: string;
}

export interface CozyDashboardSnapshot {
  businessDate: string;
  mode: "SHADOW_READ_ONLY";

  invoiceCount: number;
  productCount: number;
  netQuantity: number;

  metrics: CozyMetric[];
  variances: CozyVariance[];
  actions: CozyAction[];

  sources: {
    kiotviet: CozyDataQuality;
    bom: CozyDataQuality;
    actualConsumption: CozyDataQuality;
  };
}
