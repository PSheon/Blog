"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  task: "任務",
  tasks: { reverse: "反轉", copy: "複製", sort: "排序" },
  taskIntro: {
    reverse: "讀六個數字，然後把它們倒過來寫。",
    copy: "讀六個數字，然後原封不動再寫一次。",
    sort: "讀六個數字，然後由小到大排好。",
  },
  reads: "模型讀到",
  writes: "正確答案",
  writesNow: "它現在寫出來的",
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
  params: "個參數",
  lossCurve: "損失曲線（從第一步到現在）",
  untrained: "還沒開始訓練。現在的權重是隨機的，所以上面它寫出來的答案是亂猜的。",
  reroll: "換一題",
  attention: "注意力圖：它寫每一位的時候，在看輸入的哪裡",
  head: (n: number) => `注意力頭 ${n}`,
  rowAxis: "正在寫的位置",
  colAxis: "被讀取的位置",
  readingUntrained: "還沒訓練的時候，亮的位置是隨機的，沒有意義。按「開始訓練」，看它怎麼變。",
  reading: (head: number, source: string, written: string) =>
    `怎麼讀這張圖：看注意力頭 ${head} 裡標著「→」的那一列。最亮的一格落在輸入的「${source}」上，代表模型此刻正在讀它，所以它接著寫下「${written}」。往下每一列都是同樣的道理。`,
  readingDiffuse: (pct: number) =>
    `還沒學會。標著「→」的那一列，注意力還分散在好幾格上（最亮的一格只佔 ${pct}%），模型還不知道該看哪裡。繼續訓練，看它什麼時候集中到一格上。`,
  veil: "上半部是輸入，不計分",
};

const en: typeof zh = {
  task: "Task",
  tasks: { reverse: "Reverse", copy: "Copy", sort: "Sort" },
  taskIntro: {
    reverse: "Read six digits, then write them backwards.",
    copy: "Read six digits, then write them again unchanged.",
    sort: "Read six digits, then write them in ascending order.",
  },
  reads: "the model reads",
  writes: "correct answer",
  writesNow: "what it writes now",
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
  untrained: "Not trained yet. The weights are random, so the answer it writes above is a guess.",
  reroll: "Another one",
  attention: "Attention maps: where in the input it looks while writing each digit",
  head: (n) => `Attention head ${n}`,
  rowAxis: "position being written",
  colAxis: "position being read",
  readingUntrained: "Before training, the bright cells are random and mean nothing. Press Train and watch them change.",
  reading: (head, source, written) =>
    `How to read this: in attention head ${head}, find the row marked “→”. Its brightest cell sits on the input digit “${source}”, which means the model is reading that digit right now, so the next thing it writes is “${written}”. Every row below works the same way.`,
  readingDiffuse: (pct) =>
    `Not learned yet. In the row marked “→” attention is still spread over several cells (the brightest holds only ${pct}%), so the model doesn't know where to look. Keep training and watch it settle on one cell.`,
  veil: "top half is the input, not scored",
};

export type Labels = typeof zh;

export function useLabels(): Labels {
  return useLocaleLabels(zh, en);
}
