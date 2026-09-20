"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  period: "2024 年 1 月 2 日 – 12 月 31 日，每日收盤價",
  change: "全年漲幅",
  generations: "世代數",
  population: "族群大小",
  mutation: "突變率",
  train: "開始訓練",
  retrain: "重新訓練",
  stop: "停止",
  clear: "清除結果",
  training: (g: number, n: number) => `訓練中：第 ${g} / ${n} 代`,
  idle: "設定參數後按「開始訓練」。每一代都會讓整個族群把這一年交易一遍。",
  restored: "已載入你上次在這個瀏覽器的訓練結果。",
  roi: "最佳策略報酬率",
  hold: "買進持有",
  buys: "買入",
  sells: "賣出",
  shares: "期末持股",
  gains: "總損益",
  chart: "AAPL 收盤價與最佳策略的買賣點",
  buy: "買",
  sell: "賣",
  evolution: "每一代的最佳報酬率",
  holdLine: "虛線是買進持有",
  log: "交易日誌",
  day: "日期",
  action: "動作",
  price: "價格",
  ret: "該股報酬",
  cash: "現金餘額",
  noTrades: "這個策略一整年都沒有交易。",
  more: (n: number) => `另外還有 ${n} 筆`,
};

const en: typeof zh = {
  period: "2 January – 31 December 2024, daily close",
  change: "change over the year",
  generations: "Generations",
  population: "Population",
  mutation: "Mutation rate",
  train: "Train",
  retrain: "Train again",
  stop: "Stop",
  clear: "Clear result",
  training: (g, n) => `Training: generation ${g} of ${n}`,
  idle: "Set the parameters and press Train. In every generation the whole population trades this year once.",
  restored: "Loaded the result of your last training run in this browser.",
  roi: "best strategy ROI",
  hold: "buy & hold",
  buys: "buys",
  sells: "sells",
  shares: "shares at year end",
  gains: "profit / loss",
  chart: "AAPL closing price with the best strategy's buys and sells",
  buy: "buy",
  sell: "sell",
  evolution: "Best ROI of each generation",
  holdLine: "dashed line is buy & hold",
  log: "Trade log",
  day: "Date",
  action: "Action",
  price: "Price",
  ret: "Return on share",
  cash: "Cash",
  noTrades: "This strategy made no trades all year.",
  more: (n) => `and ${n} more`,
};

export type Labels = typeof zh;

export function useLabels(): Labels {
  return useLocaleLabels(zh, en);
}
