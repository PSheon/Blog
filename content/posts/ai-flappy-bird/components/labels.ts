"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  generation: "世代",
  alive: "存活",
  score: "通過管數",
  best: "最高紀錄",
  speed: "速度",
  max: "最快",
  play: "播放",
  pause: "暫停",
  restart: "重新開始",
  canvas: "五十隻由神經網路控制的小鳥正在穿越管道。",
  brain: "領頭鳥的大腦",
  inputs: ["鳥的高度", "開口高度"],
  output: "拍翅膀？",
  flap: "拍",
  glide: "不拍",
  positive: "正權重",
  negative: "負權重",
  history: "每一代通過的管數（100 根就畢業，換下一代）",
  historyEmpty: "第一代還沒結束",
};

const en: typeof zh = {
  generation: "generation",
  alive: "alive",
  score: "pipes cleared",
  best: "record",
  speed: "Speed",
  max: "max",
  play: "Play",
  pause: "Pause",
  restart: "Restart",
  canvas: "Fifty birds, each steered by a neural network, flying through pipes.",
  brain: "The leader's brain",
  inputs: ["bird height", "gap height"],
  output: "flap?",
  flap: "flap",
  glide: "glide",
  positive: "positive weight",
  negative: "negative weight",
  history: "Pipes cleared by each generation (100 and the flock graduates)",
  historyEmpty: "The first generation is still flying",
};

export type Labels = typeof zh;

export function useLabels(): Labels {
  return useLocaleLabels(zh, en);
}
