"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  picture: "Sketchbook 的遊樂園，由你的 GPU 即時路徑追蹤。拖曳轉動視角。",
  start: "開始", pause: "暫停", restart: "重來",
  building: "正在下載遊樂園、蓋 BVH…", fallbackNote: "",
  noWebgpu: "這個瀏覽器沒有 WebGPU，這張圖需要它。請用新版的 Chrome、Edge 或 Safari 26 打開。",
  noAdapter: "瀏覽器有 WebGPU，但沒有 GPU 回應（可能被停用，或是在遠端桌面裡）。",
  failed: "GPU 啟動失敗了（驅動程式拒絕了這段著色器，或裝置中途斷線）。細節在瀏覽器的主控台。",
  mode: "怎麼畫", raster: "光柵", direct: "只有直接光", full: "完整光追",
  view: "視角", cars: "停車場", air: "空中", low: "低空", ground: "地面",
  hour: "太陽的時間", spp: "累積的樣本", msPerSample: "一個樣本", ms: "ms", triangles: "三角形",
  stick: "移動：拖曳搖桿，或選取它之後用方向鍵、W A S D",
  hint: "拖曳畫面轉動視角。先點一下畫面，再用 W A S D 移動、Q E 升降、Shift 加速；手機用左下角的搖桿。一動，累積的樣本就全部作廢，畫面會回到雜訊。",
};

const en: typeof zh = {
  picture: "Sketchbook's playground, path traced live on your GPU. Drag to look around.",
  start: "Start", pause: "Pause", restart: "Restart",
  building: "Fetching the playground and building its BVH…", fallbackNote: "",
  noWebgpu: "This browser has no WebGPU, and this figure needs it. Open it in a recent Chrome, Edge or Safari 26.",
  noAdapter: "The browser has WebGPU but no GPU answered (it may be disabled, or this is a remote desktop).",
  failed: "The GPU did not start (the driver rejected the shader, or the device was lost). The details are in the browser console.",
  mode: "Drawn by", raster: "Raster", direct: "Direct light only", full: "Full path tracing",
  view: "View", cars: "Car park", air: "Air", low: "Low", ground: "Ground",
  hour: "Time of day", spp: "Samples so far", msPerSample: "One sample", ms: "ms", triangles: "Triangles",
  stick: "Move: drag the stick, or focus it and use the arrow keys or W A S D",
  hint: "Drag the picture to look around. Click it first, then W A S D to move, Q E to rise and sink, Shift to go faster; on a phone use the stick in the corner. Any movement throws away every sample so far, and the picture is noise again.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
