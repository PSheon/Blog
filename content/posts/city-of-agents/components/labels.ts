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
  followSomeone: "跟著一個人走", backToCity: "回到全景", following: "正在跟拍", pickHint: "點場景裡的小人可以跟拍；點空白處回到全景。",
  overseer: "總覽", person: "誰", doing: "在做什麼", where: "在哪／去哪", needs: "疲勞・飢餓・社交・責任",
  needNames: ["疲勞", "飢餓", "社交", "責任"],
  states: { traveling: "前往", acting: "", idle: "沒事" },
  table: "所有人的狀態表，可捲動；點一列就跟拍那個人",
  events: "事件流", noEvents: "還沒有事件",
  ev: { departed: "離開", heading: "前往", started: "開始", finished: "結束", idle: "沒事做，待在", config: "規則改變", street: "路上", on: "開", off: "關" },
  places: { home: "家", office: "辦公", food: "餐廳", park: "公園", riverside: "河岸" },
  zones: { residential: "住宅區", commercial: "商業區", food: "餐飲街", park: "公園", riverside: "河岸" },
  knobs: "旋鈕", rate: "時間速率", count: "小人數", separation: "互相閃避的力道", seed: "種子", regenerate: "換一座城市",
  timeline: "時間軸", timelineHint: "拖回去看任一時刻；畫面只用事件記錄推回去，不重新模擬", live: "回到現在", replay: "重播",
  recordFrom: "記錄起點", modeMark: "規則在這裡改過",
  peak: "出發尖峰", peakHint: "過去 24 小時裡，最擠的 10 分鐘有多少比例的人同時出發", histogram: "過去 24 小時每 10 分鐘的出發人數",
  names: ["阿凱", "小美", "志明", "春嬌", "阿土", "佩君", "冠宇", "怡君", "家豪", "雅婷", "承恩", "宜蓁", "柏翰", "欣怡", "俊傑", "淑芬", "建宏", "美玲", "宗翰", "詩涵", "信宏", "惠雯", "文傑", "佳穎", "明哲", "筱涵", "國華", "雅雯", "子軒", "思妤", "彥廷", "郁婷", "哲瑋", "靜宜", "育成", "婉婷", "志豪", "曉玲", "政憲", "珮瑜"],
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
  followSomeone: "Follow someone", backToCity: "Back to the city", following: "Following", pickHint: "Click a person in the scene to follow them; click anywhere else to return.",
  overseer: "Overseer", person: "who", doing: "doing", where: "at / going to", needs: "fatigue · hunger · social · duty",
  needNames: ["fatigue", "hunger", "social", "duty"],
  states: { traveling: "to", acting: "", idle: "nothing" },
  table: "Everyone's state, scrollable; choose a row to follow that person",
  events: "Events", noEvents: "No events yet",
  ev: { departed: "leaves", heading: "for", started: "starts", finished: "finishes", idle: "has nothing to do, stays at", config: "rules changed", street: "the street", on: "on", off: "off" },
  places: { home: "home", office: "office", food: "restaurant", park: "park", riverside: "riverside" },
  zones: { residential: "residential", commercial: "commercial", food: "restaurant street", park: "park", riverside: "riverside" },
  knobs: "Knobs", rate: "Time rate", count: "People", separation: "How hard people avoid each other", seed: "seed", regenerate: "Another city",
  timeline: "Timeline", timelineHint: "Drag back to any moment; the picture is worked out from the event record, not re-simulated", live: "Back to now", replay: "replay",
  recordFrom: "record starts", modeMark: "the rules changed here",
  peak: "Departure peak", peakHint: "share of people who set off in the busiest ten minutes of the last 24 hours", histogram: "departures per ten minutes over the last 24 hours",
  names: ["Kai", "Mei", "Ming", "Jiao", "Tu", "Pei", "Yu", "Yi", "Hao", "Ting", "En", "Zhen", "Han", "Xin", "Jie", "Fen", "Hong", "Ling", "Zong", "Shi", "Xinh", "Wen", "Wei", "Ying", "Zhe", "Xiao", "Hua", "Ya", "Xuan", "Si", "Yan", "Yuting", "Zhewei", "Jing", "Cheng", "Wan", "Zhihao", "Lin", "Xian", "Peiyu"],
};

export type Labels = typeof zh;

/** "阿凱", and "阿凱 2" for the forty-first person. */
export const personName = (t: Labels, id: number): string => t.names[id % t.names.length] + (id >= t.names.length ? ` ${Math.floor(id / t.names.length) + 1}` : "");

export function useLabels() {
  return usePathname()?.startsWith("/en") ? en : zh;
}
