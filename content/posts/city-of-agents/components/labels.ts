"use client";

import { usePathname } from "next/navigation";

const zh = {
  scene: "一座程序化生成的城市，從 45 度角往下看，鏡頭緩緩繞行；光線、天色、路燈和窗戶的燈跟著城市裡的時間變化。",
  play: "開始", pause: "暫停",
  speed: "時間速率",
  clock: "城市時間",
  frame: "每幀耗時", frameUnit: "ms · CPU",
  calls: "draw calls",
  loading: "載入場景…",
  people: "人",
  sync: "同步度", syncHint: "此刻做同一件事的人佔多少",
  legend: "小人的顏色是他正在做、或正要去做的事",
  actions: { work: "工作", eat: "吃飯", social: "社交", sleep: "回家", idle: "沒事" },
  mode: "誰在做決定",
  modes: { utility: "各看各的需求", fsm: "固定時程", random: "隨機" },
  duty: "責任",
};

const en: typeof zh = {
  scene: "A procedurally generated city seen from 45 degrees above, the camera circling slowly; light, sky, street lamps and lit windows follow the city's clock.",
  play: "Play", pause: "Pause",
  speed: "Time rate",
  clock: "City time",
  frame: "Frame time", frameUnit: "ms · CPU",
  calls: "draw calls",
  loading: "Loading the scene…",
  people: "people",
  sync: "In step", syncHint: "share of people doing the same thing right now",
  legend: "A person's colour is what they are doing, or on their way to do",
  actions: { work: "work", eat: "eat", social: "company", sleep: "home", idle: "nothing" },
  mode: "Who decides",
  modes: { utility: "each by their needs", fsm: "fixed timetable", random: "at random" },
  duty: "Duty",
};

export function useLabels() {
  return usePathname()?.startsWith("/en") ? en : zh;
}
