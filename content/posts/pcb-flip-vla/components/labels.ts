"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  big: "工作台：機械手臂、兩個托盤、兩塊電路板，從斜上方看。綠色是零件面，銅色是焊接面。",
  eye: "模型看到的畫面：同一個視角，48 × 48 像素",
  eyeLabel: "模型看到的（48 × 48）",
  play: "開始", pause: "暫停", next: "下一題",
  instruction: "指令", state: "專家現在在做", step: "步數", outcome: "結果",
  success: "完成", failed: "失敗", running: "進行中",
  slip: "每步滑落機率",
  shove: "推手臂", nudge: "推板子", turn: "把板子翻回去", camera: "相機偏 5°", cameraBack: "相機回正",
  disturb: "搗亂",
  states: { done: "沒事做／回原位", open: "鬆開夾爪", rise: "先抬高", above: "移到板邊上方", level: "把夾爪轉平", descend: "下降", grasp: "夾住", lift: "抬起", roll: "翻轉", over: "移回托盤上方", lower: "放下", release: "鬆開" },
  events: { grasped: "夾住了", missed: "夾歪了，板子被推開", placed: "放好了", dropped: "掉回托盤", lost: "掉到托盤外", slipped: "滑掉了", jammed: "卡住（太低就翻）" },
  lastEvent: "剛剛發生",
  who: "誰在操作", expert: "專家（看得到真實狀態）",
  models: { "bc-v2": "BC：只看過專家示範", "dart-v2": "DART：專家手抖著示範", "dagger-v2": "DAgger：自己犯錯、專家改考卷", "dagger-cam-v2": "DAgger + 收資料時相機也亂動" },
  modelNote: "四個模型架構完全相同，都只看右邊的小圖。",

  loading: "下載模型（1.9 MB）…", inference: "模型每步推論", ms: "ms · CPU",
  wouldDo: "專家此刻會",
};

const en: typeof zh = {
  big: "The bench: an arm, two trays and two circuit boards, seen from above at an angle. Green is the component side, copper the solder side.",
  eye: "What the model sees: the same view at 48 × 48 pixels",
  eyeLabel: "what the model sees (48 × 48)",
  play: "Play", pause: "Pause", next: "Next task",
  instruction: "instruction", state: "the expert is", step: "step", outcome: "outcome",
  success: "done", failed: "failed", running: "running",
  slip: "Chance of a slip per step",
  shove: "Shove the arm", nudge: "Nudge the board", turn: "Turn the board back", camera: "Tilt the camera 5°", cameraBack: "Straighten the camera",
  disturb: "Interfere",
  states: { done: "idle / going home", open: "opening the gripper", rise: "rising first", above: "moving above the edge", level: "levelling the jaws", descend: "descending", grasp: "grasping", lift: "lifting", roll: "rolling", over: "moving back over the tray", lower: "lowering", release: "releasing" },
  events: { grasped: "grasped", missed: "bad pinch, the board was shoved", placed: "placed", dropped: "dropped into the tray", lost: "dropped outside the tray", slipped: "slipped", jammed: "jammed (rolled too low)" },
  lastEvent: "just happened",
  who: "Who is driving", expert: "the expert (sees the true state)",
  models: { "bc-v2": "BC: expert demonstrations only", "dart-v2": "DART: the expert demonstrates with shaky hands", "dagger-v2": "DAgger: it errs, the expert marks it", "dagger-cam-v2": "DAgger + a camera that was knocked about while collecting" },
  modelNote: "The four models are the same architecture, and all of them see only the small picture.",

  loading: "Fetching the model (1.9 MB)…", inference: "inference per step", ms: "ms · CPU",
  wouldDo: "the expert would be",
};

export type Labels = typeof zh;
export function useLabels() {
  return useLocaleLabels(zh, en);
}
