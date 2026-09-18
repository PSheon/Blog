"use client";

import { usePathname } from "next/navigation";

const zh = {
  task: "任務",
  tasks: { reverse: "反轉", copy: "複製", sort: "排序" },
  train: "開始訓練",
  resume: "繼續",
  pause: "暫停",
  reset: "重置權重",
  speed: "速度",
  slow: "慢",
  fast: "快",
  step: "訓練步數",
  loss: "損失",
  accuracy: "整串答對率",
  params: "參數",
  lossCurve: "損失曲線（從第一步到現在）",
  untrained: "還沒開始訓練，現在的權重是隨機的。",
  probe: "拿這串數字來測",
  probeHelp: "輸入 6 個數字",
  random: "隨機",
  input: "輸入",
  output: "模型的回答",
  expected: "正確答案",
  head: (n: number) => `注意力頭 ${n}`,
  heatHelp: "每一列是一個位置，顏色代表它從左邊哪些位置讀取資訊。上半部是輸入（不計分），下半部才是模型在作答。",
  rowAxis: "正在產生的位置",
  colAxis: "被讀取的位置",
};

const en: typeof zh = {
  task: "Task",
  tasks: { reverse: "Reverse", copy: "Copy", sort: "Sort" },
  train: "Train",
  resume: "Resume",
  pause: "Pause",
  reset: "Reset weights",
  speed: "Speed",
  slow: "slow",
  fast: "fast",
  step: "training steps",
  loss: "loss",
  accuracy: "whole answers right",
  params: "parameters",
  lossCurve: "Loss, from the first step until now",
  untrained: "Not trained yet: the weights are random.",
  probe: "Test it on these digits",
  probeHelp: "Type 6 digits",
  random: "Random",
  input: "input",
  output: "model's answer",
  expected: "correct answer",
  head: (n) => `Attention head ${n}`,
  heatHelp: "Each row is a position; colour shows which earlier positions it reads from. The top half is the input (not scored); the bottom half is the model answering.",
  rowAxis: "position being produced",
  colAxis: "position being read",
};

export type Labels = typeof zh;

export function useLabels(): Labels {
  return usePathname().startsWith("/en") ? en : zh;
}
