"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  start: "開始", pause: "暫停", restart: "重來",
  building: "正在蓋 BVH…", fallbackNote: "",
  noWebgpu: "這個瀏覽器沒有 WebGPU，這張圖需要它。請用新版的 Chrome、Edge 或 Safari 26 打開。",
  noAdapter: "瀏覽器有 WebGPU，但沒有 GPU 回應（可能被停用，或是在遠端桌面裡）。",
  failed: "GPU 啟動失敗了（驅動程式拒絕了這段著色器，或裝置中途斷線）。按「重來」再試一次；細節在瀏覽器的主控台。",
  racePicture: "同一個房間畫四次，每一格用不同的方法決定光線往哪裡去",
  uniform: "亂彈", cosine: "照 cosine 彈", nee: "＋直接問燈", mis: "＋兩種都算（MIS）", short: ["亂彈", "cosine", "問燈", "MIS"],
  spp: "每像素樣本數", error: "誤差", worth: "一個樣本抵", worthUnit: "個", mean: "平均亮度",
  chart: "橫軸：每像素樣本數（對數）；縱軸：各格的誤差（對數）。四條線平行，斜率都是 −½，差別在高低。", chartX: "樣本數", chartY: "誤差",
  lamp: "燈的大小", lampSmall: "小", lampMedium: "中", lampLarge: "大", ball: "中間那顆球", rough: "粗糙", smooth: "光滑",
  materialPicture: "三顆球的房間：左邊霧面，中間的材質由你決定，右邊玻璃",
  kind: "材質", matte: "霧面", metal: "金屬", glass: "玻璃", roughness: "粗糙度", ior: "折射率", furnace: "白爐測試",
  furnaceNote: "白爐：燈關掉，房間外面是均勻的白光 1，所有表面都改成純白。一個不吃光也不生光的材質，應該和背景一樣白、完全看不見。比背景暗：它吃掉了一些光。比背景亮：它憑空生出了光，那就是寫錯了。",
  raceNote: "「一個樣本抵幾個」是和「照 cosine 彈」比：誤差是它的一半，就等於它的四個樣本。四格的平均亮度應該一樣：方法只能改變雜訊，不能改變答案。",
};

const en: typeof zh = {
  start: "Start", pause: "Pause", restart: "Restart",
  building: "Building the BVH…", fallbackNote: "",
  noWebgpu: "This browser has no WebGPU, and this figure needs it. Open it in a recent Chrome, Edge or Safari 26.",
  noAdapter: "The browser has WebGPU but no GPU answered (it may be disabled, or this is a remote desktop).",
  failed: "The GPU did not start (the driver rejected the shader, or the device was lost). Press Restart to try again; the details are in the browser console.",
  racePicture: "The same room four times, each tile choosing where its rays go in a different way",
  uniform: "Any direction", cosine: "By the cosine", nee: "+ ask the lamp", mis: "+ count both (MIS)", short: ["any", "cosine", "ask", "MIS"],
  spp: "Samples per pixel", error: "Error", worth: "One sample is worth", worthUnit: "", mean: "Mean brightness",
  chart: "Horizontal: samples per pixel (log). Vertical: each tile's error (log). Four parallel lines of slope −½; they differ in height.", chartX: "samples", chartY: "error",
  lamp: "Lamp size", lampSmall: "small", lampMedium: "medium", lampLarge: "large", ball: "The middle ball", rough: "rough", smooth: "smooth",
  materialPicture: "A room with three balls: matte on the left, yours to change in the middle, glass on the right",
  kind: "Material", matte: "Matte", metal: "Metal", glass: "Glass", roughness: "Roughness", ior: "Index of refraction", furnace: "White furnace",
  furnaceNote: "The furnace: the lamp is off, outside the room is an even white of 1, and every surface is made pure white. A material that neither eats nor makes light should be as white as the background and vanish. Darker than the background: it ate some light. Brighter: it made light out of nothing, and that is a bug.",
  raceNote: "\"One sample is worth\" is measured against the cosine tile: half its error means four of its samples. The four means should agree: a method can change the noise, never the answer.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
