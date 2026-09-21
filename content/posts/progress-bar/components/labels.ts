"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  bars: { count: "數件數", work: "照預估工作量", plan: "把剩下的照計畫排一次", learn: "照計畫排，並從做完的任務修正預估" },
  barsShort: { count: "數件數", work: "照工作量", plan: "照計畫", learn: "邊做邊學" },
  time: "真正過去的時間", timeHint: "（整份工作跑完才知道）",
  start: "開始", again: "再跑一次", another: "換一份工作", pause: "暫停",
  timeline: "工作的時間軸：一列是一個 worker，一格是一個任務，顏色是任務的種類，垂直線是現在",
  chart: "橫軸：真正過去的時間；縱軸：進度條顯示的數字。虛線是誠實的進度條。",
  honest: "誠實", shownAxis: "顯示的進度", timeAxis: "真正過去的時間",
  gapChart: "橫軸：真正過去的時間；縱軸：進度條顯示的數字和實際差了幾點（不分高估低估）。越低越誠實。", gapAxis: "差幾點",
  error: "平均差多少", points: "點", above90: "有多少時間卡在 90% 以上", honestIs: "誠實的話是 10%",
  skew: "任務大小有多懸殊", skewLow: "都差不多", skewHigh: "少數幾個特別大",
  workers: "worker 數", total: "整份工作要多久", minutes: "分鐘", floor: "最長的那條相依鏈：再多 worker 也不會更快",
  bias: "預估有多不準（同一種任務錯同一個方向）", learning: "讓它從做完的任務學",
  computing: "正在算", runs: "份工作的平均", backwards: "曾經倒退",
  kinds: "任務種類", learned: "學到的修正", truth: "實際",
};

const en: typeof zh = {
  bars: { count: "count the tasks", work: "weigh by estimated work", plan: "schedule what is left, as planned", learn: "as planned, corrected by the tasks that have finished" },
  barsShort: { count: "count", work: "by work", plan: "by the plan", learn: "plan + learning" },
  time: "time that has really passed", timeHint: "(only known once the job is over)",
  start: "Start", again: "Run it again", another: "Another job", pause: "Pause",
  timeline: "The job's timeline: a row is a worker, a block is a task, its colour is the kind of task, the vertical line is now",
  chart: "Across: time that has really passed. Up: what the bar shows. The dashed line is an honest bar.",
  honest: "honest", shownAxis: "shown", timeAxis: "time passed",
  gapChart: "Across: time that has really passed. Up: how many points the bar is off by, either way. Lower is more honest.", gapAxis: "points off",
  error: "off by, on average", points: "points", above90: "share of the run spent at 90 % or more", honestIs: "an honest bar: 10 %",
  skew: "How unequal the tasks are", skewLow: "all about the same", skewHigh: "a few huge ones",
  workers: "Workers", total: "How long the whole job takes", minutes: "minutes", floor: "the longest chain of tasks waiting on each other: more workers cannot beat it",
  bias: "How wrong the estimates are (one kind of task, wrong the same way)", learning: "Let it learn from finished tasks",
  computing: "working out", runs: "jobs, averaged", backwards: "stepped back by",
  kinds: "kind of task", learned: "correction learned", truth: "actual",
};

export type Labels = typeof zh;
export function useLabels() {
  return useLocaleLabels(zh, en);
}
