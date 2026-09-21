"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  picture: "路徑追蹤中的 Cornell box：一開始全是雜訊，樣本越多越清楚",
  spp: "每像素樣本數", rays: "每秒光線", million: "百萬", noise: "畫面誤差", steps: "每條光線走訪的節點", triangles: "三角形", build: "建 BVH", ms: "ms",
  start: "開始", pause: "暫停", restart: "重來", bounces: "反彈次數", unlimited: "不限",
  building: "正在蓋 BVH…", loading: "正在啟動 GPU…", gpu: "GPU",
  chart: "橫軸：每像素樣本數（對數）；縱軸：畫面誤差（對數）。虛線的斜率是 −½。", chartX: "樣本數", chartY: "誤差", slope: "斜率 −½",
  noWebgpu: "這個瀏覽器沒有 WebGPU，這張圖需要它。請用新版的 Chrome、Edge 或 Safari 26 打開。",
  noAdapter: "瀏覽器有 WebGPU，但沒有 GPU 回應（可能被停用，或是在遠端桌面裡）。",
  measured: "誤差怎麼量的：奇數樣本和偶數樣本各自累積成一張圖，兩張圖差距的一半就是這張圖的誤差，不需要參考圖。數字是相對於整張圖的平均亮度：10% 表示一個像素平均還差平均亮度的一成。",
};

const en: typeof zh = {
  picture: "A Cornell box being path traced: all noise at first, clearer with every sample",
  spp: "Samples per pixel", rays: "Rays per second", million: "million", noise: "Error of the picture", steps: "Nodes visited per ray", triangles: "Triangles", build: "BVH build", ms: "ms",
  start: "Start", pause: "Pause", restart: "Restart", bounces: "Bounces", unlimited: "no limit",
  building: "Building the BVH…", loading: "Starting the GPU…", gpu: "GPU",
  chart: "Horizontal: samples per pixel (log). Vertical: error of the picture (log). The dashed line has slope −½.", chartX: "samples", chartY: "error", slope: "slope −½",
  noWebgpu: "This browser has no WebGPU, and this figure needs it. Open it in a recent Chrome, Edge or Safari 26.",
  noAdapter: "The browser has WebGPU but no GPU answered (it may be disabled, or this is a remote desktop).",
  measured: "How the error is measured: odd and even samples build two pictures of their own; half the gap between them is this picture's error. No reference image is needed. The number is relative to the picture's mean brightness: 10% means a typical pixel is still a tenth of the average brightness off.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
