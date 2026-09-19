"use client";

import { usePathname } from "next/navigation";
import type { ShapeName } from "./shapes";

const zh = {
  fruit: { apple: "蘋果", banana: "香蕉", grapes: "葡萄", watermelon: "西瓜", orange: "橘子" } satisfies Record<ShapeName, string>,
  left: "左邊長成",
  right: "右邊長成",
  train: "開始訓練",
  pause: "暫停",
  resume: "繼續",
  reset: "忘光重來",
  steps: "訓練步數",
  loss: "誤差",
  perSec: "步／秒",
  blend: "混合的那一團：要幾分像左邊、幾分像右邊",
  blendValue: (a: string, b: string, t: number) => `${Math.round((1 - t) * 100)}% ${a} ＋ ${Math.round(t * 100)}% ${b}`,
  untrained: "還沒訓練。現在它對水果一無所知，所以雜訊走完 40 步還是一團雜訊。",
  learning: "正在學。每一輪都從全新的雜訊開始，走 40 步。",
  paused: "訓練暫停了，但取樣還在繼續：每一輪用的是同一個模型、不同的雜訊，所以每次長出來的點都不一樣。",
  stage: "三團點雲：左邊和右邊各是一種水果，中間是兩者的混合",
  level: "雜訊等級",
  levelValue: (t: number, total: number, kept: number) => `${t} / ${total}，原本的形狀還剩 ${kept}%`,
  noiseStage: "一顆水果的點雲，依照滑桿加上雜訊",
  sample: "從新的雜訊取樣一次",
  step: "第幾步",
  stepValue: (k: number, total: number, level: number) => `${k} / ${total}（雜訊等級 ${level}）`,
  stepsStage: "取樣過程中的點雲，拖動滑桿前後看",
  needTraining: "上面的模型還沒訓練過，所以這裡怎麼走都是一團雜訊。先回去按「開始訓練」，再回來按一次取樣。",
  trainedFor: (n: number) => `用的是上面那個模型，它目前訓練了 ${n.toLocaleString()} 步。`,
};

const en: typeof zh = {
  fruit: { apple: "apple", banana: "banana", grapes: "grapes", watermelon: "watermelon", orange: "orange" },
  left: "On the left, grow",
  right: "On the right, grow",
  train: "Train",
  pause: "Pause",
  resume: "Resume",
  reset: "Forget everything",
  steps: "training steps",
  loss: "error",
  perSec: "steps/s",
  blend: "The blended cloud: how much like the left, how much like the right",
  blendValue: (a: string, b: string, t: number) => `${Math.round((1 - t) * 100)}% ${a} + ${Math.round(t * 100)}% ${b}`,
  untrained: "Not trained yet. It knows nothing about fruit, so after 40 steps the noise is still noise.",
  learning: "Learning. Every round starts from fresh noise and takes 40 steps.",
  paused: "Training is paused but sampling goes on: the same model, different noise each round, so the points never land in the same places twice.",
  stage: "Three point clouds: a fruit on the left, a fruit on the right, a blend of the two in the middle",
  level: "noise level",
  levelValue: (t: number, total: number, kept: number) => `${t} / ${total}, ${kept}% of the original shape left`,
  noiseStage: "A fruit's point cloud with as much noise added as the slider says",
  sample: "Sample once from fresh noise",
  step: "step",
  stepValue: (k: number, total: number, level: number) => `${k} / ${total} (noise level ${level})`,
  stepsStage: "The point cloud during sampling; drag the slider back and forth",
  needTraining: "The model above has not been trained, so whatever happens here stays noise. Go back, press Train, then sample again here.",
  trainedFor: (n: number) => `This uses the model above, trained for ${n.toLocaleString()} steps so far.`,
};

export function useLabels() {
  return usePathname().startsWith("/en") ? en : zh;
}
