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
};

const en: typeof zh = {
  scene: "A procedurally generated city seen from 45 degrees above, the camera circling slowly; light, sky, street lamps and lit windows follow the city's clock.",
  play: "Play", pause: "Pause",
  speed: "Time rate",
  clock: "City time",
  frame: "Frame time", frameUnit: "ms · CPU",
  calls: "draw calls",
  loading: "Loading the scene…",
};

export function useLabels() {
  return usePathname()?.startsWith("/en") ? en : zh;
}
