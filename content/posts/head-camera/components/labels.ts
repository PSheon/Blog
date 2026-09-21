"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  bench: "工作台的 3D 視圖：拖紅色方塊移動它，拖空白處轉視角",
  benchHint: "拖方塊 · 拖空白處轉視角",
  eye: "頭部相機看到的 32 × 32 畫面",
  eyeNow: "它現在看到的（每一步都重看）",
  eyeOnce: "它唯一看過的那一張（手臂收起來時拍的）",
  dots: "彩色點是網路壓出來的 8 個關鍵點。",
  loading: "載入模型中…",
  failed: "模型載入失敗，重新整理再試一次。",
  policy: "誰在操作",
  closed: "持續看",
  open: "看一眼",
  mine: "你練的",
  play: "播放", pause: "暫停", reset: "重來",
  gap: "手離方塊", status: "狀態",
  there: "到了", going: "前往中", homing: "回原位拍照",
  pitch: "相機下傾", yaw: "相機左右轉", noise: "畫面雜訊", light: "光線",

  train: "開始訓練", again: "重新訓練", stop: "停止",
  trainNote: "在你的瀏覽器裡、用 JavaScript 從零訓練。訓練期間可以繼續往下讀。",
  step: "步數", seconds: "已經過", eta: "大約還要", loss: "動作的誤差",
  probe: "固定的一張畫面：看 8 個關鍵點怎麼慢慢找到手和方塊",
  testing: "訓練完成，測驗中…",
  result: "測驗結果",
  straight: "相機沒動", pitched: "相機下傾 5°",
  episodes: (n: number) => `各 ${n} 回合`,
  toBench: "上面的工作台多了一個「你練的」可以選。",
  secondsUnit: "秒",
};

const en: typeof zh = {
  bench: "The bench in 3D: drag the red block to move it, drag anywhere else to turn the view",
  benchHint: "drag the block · drag elsewhere to turn",
  eye: "The head camera's 32 × 32 picture",
  eyeNow: "What it sees now (it looks again every step)",
  eyeOnce: "The only picture it saw (taken with the arm parked)",
  dots: "The coloured dots are the eight keypoints the network squeezes the picture into.",
  loading: "Loading the models…",
  failed: "The models failed to load. Reload the page to try again.",
  policy: "Driving",
  closed: "Keep looking",
  open: "Look once",
  mine: "Yours",
  play: "Play", pause: "Pause", reset: "Reset",
  gap: "Hand to block", status: "Status",
  there: "There", going: "On its way", homing: "Going home to look",
  pitch: "Camera tilt", yaw: "Camera turn", noise: "Picture noise", light: "Light",

  train: "Start training", again: "Train again", stop: "Stop",
  trainNote: "Trained from scratch in your browser, in JavaScript. Keep reading while it runs.",
  step: "Step", seconds: "Elapsed", eta: "About", loss: "Action error",
  probe: "One fixed picture: watch the eight keypoints find the hand and the block",
  testing: "Trained. Testing…",
  result: "Test",
  straight: "Camera as trained", pitched: "Camera tilted 5°",
  episodes: (n: number) => `${n} episodes each`,
  toBench: "The bench above now has a “Yours” to choose.",
  secondsUnit: "s",
};

export const useLabels = () => useLocaleLabels(zh, en);
