"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

/** The finished picture (512², 10,497 samples, captured from figure 1 on an M4 Pro), for readers whose browser cannot draw it. */
export const FALLBACK = "/posts/light-from-noise/cornell.jpg";

const zh = {
  picture: "路徑追蹤中的 Cornell box：一開始全是雜訊，樣本越多越清楚",
  spp: "每像素樣本數", rays: "每秒光線", million: "百萬", noise: "畫面誤差", steps: "每條光線走訪的節點", triangles: "三角形", build: "建 BVH", ms: "ms",
  start: "開始", pause: "暫停", restart: "重來", bounces: "反彈次數", unlimited: "不限",
  building: "正在蓋 BVH…", loading: "正在啟動 GPU…", gpu: "GPU",
  chart: "橫軸：每像素樣本數（對數）；縱軸：畫面誤差（對數）。虛線的斜率是 −½。", chartX: "樣本數", chartY: "誤差", slope: "斜率 −½",
  noWebgpu: "這個瀏覽器沒有 WebGPU，這張圖需要它。請用新版的 Chrome、Edge 或 Safari 26 打開。",
  failed: "GPU 啟動失敗了（驅動程式拒絕了這段著色器，或裝置中途斷線）。按「重來」再試一次；細節在瀏覽器的主控台。",
  fallbackNote: "這是一張預先算好的圖（10,497 個樣本）。", gpuMissing: "這裡沒有 GPU 的答案可以比",
  noAdapter: "瀏覽器有 WebGPU，但沒有 GPU 回應（可能被停用，或是在遠端桌面裡）。",
  tile0: "0 次：只有會發光的", tile1: "1 次：直接照明", tile2: "2 次", tileAll: "不限",
  bouncesPicture: "同一個場景畫四次：光最多反彈 0 次、1 次、2 次、不限",
  heatPicture: "不上色的畫面：每個像素的顏色代表它的光線走訪了幾個 BVH 節點",
  heatUnit: "個節點", heatUnitBrute: "次三角形測試", testsPerRay: "每條光線測試的三角形", depth: "樹的深度", bvhOff: "關掉 BVH", measureAgain: "再量一次",
  bruteLimit: "超過一萬個三角形就不讓你關了：沒有 BVH，一個樣本會久到瀏覽器把這個 GPU 工作殺掉。",
  pathPicture: "算好的 Cornell box，上面畫著從你選的那個像素射出去的光線路徑",
  pathsShot: "射了幾條", pathsLit: "碰到燈的", thisPath: "最新這一條", surface: "打到的表面", hitSurface: "打到表面", hitLight: "打到燈", worth: "還剩",
  endedOutside: "從開口飛出去了：黑的", endedTired: "彈到沒力了還沒碰到燈：黑的",
  colourOne: "這一條算出來的顏色", colourMean: "{n} 條的平均", colourGpu: "GPU 那張圖上這個像素的顏色",
  shootOne: "再射一條", shootMany: "射 100 條", pathHint: "點畫面上任何一個地方，換一個像素。路徑是在你的 CPU 上用同一套演算法算的，線的顏色是光走到那裡還剩下的顏色。",
  askLamp: "直接問燈", askLampOff: "上一次（沒問燈）", askLampOn: "上一次（有問燈）",
  materialPicture: "三顆球的房間：左邊霧面，中間的材質由你決定，右邊玻璃",
  kind: "中間那顆球", matte: "霧面", metal: "金屬", glass: "玻璃", roughness: "粗糙度", ior: "折射率",
  measured: "誤差怎麼量的：奇數樣本和偶數樣本各自累積成一張圖，兩張圖差距的一半就是這張圖的誤差，不需要參考圖。數字是相對於整張圖的平均亮度：10% 表示一個像素平均還差平均亮度的一成。",
};

const en: typeof zh = {
  picture: "A Cornell box being path traced: all noise at first, clearer with every sample",
  spp: "Samples per pixel", rays: "Rays per second", million: "million", noise: "Error of the picture", steps: "Nodes visited per ray", triangles: "Triangles", build: "BVH build", ms: "ms",
  start: "Start", pause: "Pause", restart: "Restart", bounces: "Bounces", unlimited: "no limit",
  building: "Building the BVH…", loading: "Starting the GPU…", gpu: "GPU",
  chart: "Horizontal: samples per pixel (log). Vertical: error of the picture (log). The dashed line has slope −½.", chartX: "samples", chartY: "error", slope: "slope −½",
  noWebgpu: "This browser has no WebGPU, and this figure needs it. Open it in a recent Chrome, Edge or Safari 26.",
  failed: "The GPU did not start (the driver rejected the shader, or the device was lost). Press Restart to try again; the details are in the browser console.",
  fallbackNote: "This is a picture rendered earlier (10,497 samples).", gpuMissing: "no GPU answer to compare with here",
  noAdapter: "The browser has WebGPU but no GPU answered (it may be disabled, or this is a remote desktop).",
  tile0: "0: only what glows", tile1: "1: direct light", tile2: "2", tileAll: "no limit",
  bouncesPicture: "The same scene four times: light may bounce 0 times, once, twice, or without limit",
  heatPicture: "An unshaded picture: each pixel's colour is how many BVH nodes its ray visited",
  heatUnit: "nodes", heatUnitBrute: "triangle tests", testsPerRay: "Triangles tested per ray", depth: "Depth of the tree", bvhOff: "Turn the BVH off", measureAgain: "Measure again",
  bruteLimit: "Past ten thousand triangles the switch is locked: without the BVH one sample takes long enough for the browser to kill the GPU task.",
  pathPicture: "The finished Cornell box, with the paths of rays from the pixel you chose drawn over it",
  pathsShot: "Paths shot", pathsLit: "Found the light", thisPath: "The latest path", surface: "the surface it hit", hitSurface: "a surface", hitLight: "the light", worth: "left",
  endedOutside: "left through the open side: black", endedTired: "ran out of bounces before finding the light: black",
  colourOne: "The colour this one path gives", colourMean: "The mean of {n} paths", colourGpu: "This pixel in the GPU's picture",
  shootOne: "Shoot one more", shootMany: "Shoot 100", pathHint: "Click anywhere on the picture to choose another pixel. The paths are traced on your CPU by the same algorithm; a line's colour is what the light is still worth when it gets there.",
  askLamp: "Ask the lamp", askLampOff: "last run (not asking)", askLampOn: "last run (asking)",
  materialPicture: "A room with three balls: matte on the left, yours to change in the middle, glass on the right",
  kind: "The middle ball", matte: "Matte", metal: "Metal", glass: "Glass", roughness: "Roughness", ior: "Index of refraction",
  measured: "How the error is measured: odd and even samples build two pictures of their own; half the gap between them is this picture's error. No reference image is needed. The number is relative to the picture's mean brightness: 10% means a typical pixel is still a tenth of the average brightness off.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
