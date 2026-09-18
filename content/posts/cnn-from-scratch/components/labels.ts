"use client";

import { usePathname } from "next/navigation";

const zh = {
  clear: "清除",
  samples: "範例",
  draw: "在這裡畫一個數字",
  drawAria: "手寫數字畫布。用滑鼠或手指畫，或使用下方的範例按鈕。",
  networkSees: "網路看到的 28×28",
  prediction: "預測",
  confidence: "信心",
  latency: "推論時間",
  loading: "載入模型中…",
  error: "模型載入失敗。",
  retry: "重試",
  empty: "畫布是空的",
  kernel: "卷積核",
  presets: "預設",
  input: "輸入",
  output: "輸出",
  negative: "負",
  positive: "正",
  presetNames: { identity: "恆等", sobelX: "垂直邊緣", sobelY: "水平邊緣", blur: "模糊", sharpen: "銳化", laplacian: "輪廓" },
  play: "播放", pause: "暫停", step: "單步", reset: "重置",
  position: "位置",
  sum: "總和",
  layer: "層",
  maps: "張特徵圖",
  computing: "計算中",
  occlusionFor: "對這個類別的重要性",
  important: "遮住後信心下降最多",
  baseline: "原始信心",
  lowest: "遮擋後最低",
};

const en: typeof zh = {
  clear: "Clear",
  samples: "Samples",
  draw: "Draw a digit here",
  drawAria: "Handwriting canvas. Draw with a mouse or finger, or use the sample buttons below.",
  networkSees: "The 28×28 the network sees",
  prediction: "prediction",
  confidence: "confidence",
  latency: "inference",
  loading: "Loading model…",
  error: "The model failed to load.",
  retry: "Retry",
  empty: "The canvas is empty",
  kernel: "Kernel",
  presets: "Presets",
  input: "input",
  output: "output",
  negative: "negative",
  positive: "positive",
  presetNames: { identity: "Identity", sobelX: "Vertical edges", sobelY: "Horizontal edges", blur: "Blur", sharpen: "Sharpen", laplacian: "Outline" },
  play: "Play", pause: "Pause", step: "Step", reset: "Reset",
  position: "position",
  sum: "sum",
  layer: "layer",
  maps: "feature maps",
  computing: "computing",
  occlusionFor: "importance for this class",
  important: "covering it hurts confidence most",
  baseline: "baseline confidence",
  lowest: "lowest when occluded",
};

export type Labels = typeof zh;

export function useLabels(): Labels {
  return usePathname().startsWith("/en") ? en : zh;
}
