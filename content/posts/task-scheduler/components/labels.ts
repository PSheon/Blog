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
  failRate: "每一次嘗試失敗的機率", failTimeline: "同一份工作的時間軸，這次有些嘗試會失敗：粉紅色的空框加一條斜線是失敗的那一次，同一個任務之後會再出現一次", failedAttempts: "每份工作平均失敗幾次", wasted: "worker 的時間有多少花在失敗的嘗試上",
  graph: "一份 14 個任務的工作圖：箭頭從被等的任務指向等它的任務。圈圈的樣子代表任務的狀態。",
  task: "任務", nodeWaiting: "還在等別人", nodeReady: "可以開始", nodeRunning: "worker {w} 正在做", nodeRunningShort: "正在做（可以點）", nodeDone: "做完了", killHint: "按下去讓它當場失敗",
  nextStep: "下一步", autoplay: "自動播放", reset: "重來", clock: "現在", readyCount: "可以開始的任務", leftCount: "還沒做完",
  stepStart: "按「下一步」。第一步會是規則 2：有空的 worker 各拿一個可以開始的任務。",
  stepTake: "規則 2：worker {w} 拿走任務 {t}。", stepDone: "規則 3：時間跳到 {m} 分鐘，任務 {t} 做完了，等它的任務可能因此可以開始。", stepFailed: "規則 4：任務 {t} 在 {m} 分鐘失敗了。它沒有被標成做完，所以又回到「可以開始」，等它的任務繼續等。",
  stepOver: "全部做完，花了 {m} 分鐘。按「重來」，這次在任務跑到一半時點它看看。",
  kneeChart: "橫軸：worker 數；縱軸：整份工作平均要幾分鐘。水平的虛線是最長的那條相依鏈。", kneeAxis: "分鐘",
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
  failRate: "Chance that an attempt fails", failTimeline: "The same job's timeline, now with attempts that fail: an empty pink outline with a stroke through it is a failed attempt, and the same task appears again afterwards", failedAttempts: "failed attempts per job", wasted: "share of worker time spent on attempts that failed",
  graph: "A job of 14 tasks as a graph: an arrow runs from a task to the task that waits for it. The look of a circle is the state of its task.",
  task: "task", nodeWaiting: "waiting for others", nodeReady: "ready", nodeRunning: "worker {w} is on it", nodeRunningShort: "running (click it)", nodeDone: "done", killHint: "Press to make it fail on the spot",
  nextStep: "Next step", autoplay: "Play", reset: "Start over", clock: "now", readyCount: "tasks that can start", leftCount: "not finished",
  stepStart: "Press Next step. The first step is rule 2: each free worker takes a task that can start.",
  stepTake: "Rule 2: worker {w} takes task {t}.", stepDone: "Rule 3: time jumps to {m} minutes; task {t} is done, which may let the tasks waiting for it start.", stepFailed: "Rule 4: task {t} failed at {m} minutes. It is not marked as done, so it is ready again, and whatever waits for it keeps waiting.",
  stepOver: "All done in {m} minutes. Start over, and this time click a task while it is running.",
  kneeChart: "Across: number of workers. Up: how many minutes the job takes on average. The dashed horizontal line is the longest chain of tasks waiting on each other.", kneeAxis: "minutes",
  kinds: "kind of task", learned: "correction learned", truth: "actual",
};

export type Labels = typeof zh;
export function useLabels() {
  return useLocaleLabels(zh, en);
}
