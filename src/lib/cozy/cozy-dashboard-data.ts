import type { CozyDashboardSnapshot } from "@/lib/cozy/types";

export const cozyDashboardSnapshot: CozyDashboardSnapshot = {
  businessDate: "2026-08-12",
  mode: "SHADOW_READ_ONLY",

  invoiceCount: 52,
  productCount: 74,
  netQuantity: 218,

  metrics: [
    {
      label: "Doanh thu 12/08",
      value: "9.066.800 đ",
      note: "52 hóa đơn · KiotViet F&B · ACTUAL",
      quality: "ACTUAL",
    },
    {
      label: "Giá vốn KiotViet",
      value: "2.405.195 đ",
      note: "Theo báo cáo lợi nhuận KiotViet · ACTUAL",
      quality: "ACTUAL",
    },
    {
      label: "Lợi nhuận gộp",
      value: "6.661.605 đ",
      note: "Chưa trừ chi phí vận hành · không phải lợi nhuận ròng",
      quality: "ACTUAL",
    },
    {
      label: "Cảnh báo BOM",
      value: "16",
      note: "Dữ liệu tiêu hao thực tế đang là TEST",
      quality: "SIMULATED",
    },
  ],

  variances: [
    { code: "HH_0070", name: "Ức gà", theoretical: "3.560 g", actual: "4.094 g", variance: "+534 g", percent: "+15%", level: "HIGH" },
    { code: "WATER_FILTERED", name: "Nước lọc", theoretical: "2.050 ml", actual: "2.460 ml", variance: "+410 ml", percent: "+20%", level: "HIGH" },
    { code: "HH_0055", name: "Thịt dứa", theoretical: "1.250 g", actual: "1.400 g", variance: "+150 g", percent: "+12%", level: "HIGH" },
    { code: "HH_0071", name: "Khoai tây chiên", theoretical: "1.040 g", actual: "1.170 g", variance: "+130 g", percent: "+12,5%", level: "HIGH" },
    { code: "HH_0069", name: "Thăn bò", theoretical: "1.050 g", actual: "1.155 g", variance: "+105 g", percent: "+10%", level: "HIGH" },
    { code: "HH_0034", name: "Đường nước", theoretical: "1.270 ml", actual: "1.371,6 ml", variance: "+101,6 ml", percent: "+8%", level: "MEDIUM" },
    { code: "HH_0111", name: "Dầu ăn", theoretical: "286,05 ml", actual: "343,26 ml", variance: "+57,21 ml", percent: "+20%", level: "HIGH" },
    { code: "SP000133", name: "Gạo tẻ", theoretical: "2.302,63 g", actual: "2.187,50 g", variance: "-115,13 g", percent: "-5%", level: "MEDIUM" },
    { code: "HH_0050", name: "Trứng gà", theoretical: "35 quả", actual: "37 quả", variance: "+2 quả", percent: "+5,7%", level: "MEDIUM" },
    { code: "SP000130", name: "Bánh mì nguyên liệu", theoretical: "15 cái", actual: "14 cái", variance: "-1 cái", percent: "-6,7%", level: "MEDIUM" },
    { code: "HH_0053", name: "Lá bạc hà", theoretical: "8 ngọn", actual: "10 ngọn", variance: "+2 ngọn", percent: "+25%", level: "LOW" },
    { code: "HH_0066", name: "Muối hồng", theoretical: "2,52 g", actual: "3,78 g", variance: "+1,26 g", percent: "+50%", level: "LOW" },
  ],

  actions: [
    {
      priority: "1",
      title: "Kiểm tra định lượng ức gà",
      detail:
        "Tiêu hao test cao hơn BOM 534 g (+15%). Ưu tiên kiểm tra portion, món làm lại và hao hụt sơ chế.",
    },
    {
      priority: "2",
      title: "Kiểm tra nhóm dầu ăn / khoai tây",
      detail:
        "Dầu ăn +20% và khoai tây +12,5%. Có thể cùng liên quan thao tác chiên hoặc định lượng thực tế.",
    },
    {
      priority: "3",
      title: "Theo dõi thịt dứa và đường nước",
      detail:
        "Hai nguyên liệu đều vượt BOM. Chưa đủ dữ liệu một ngày để đề nghị thay BOM.",
    },
  ],

  sources: {
    kiotviet: "ACTUAL",
    bom: "THEORETICAL",
    actualConsumption: "SIMULATED",
  },
};

export const metrics = cozyDashboardSnapshot.metrics;
export const variances = cozyDashboardSnapshot.variances;
export const actions = cozyDashboardSnapshot.actions;
