"use client";

import { usePathname } from "next/navigation";
import type { Sense } from "./policy";

const zh = {
  load: "載入模擬器（約 4.5 MB）",
  loading: "載入中…",
  loadNote: "物理引擎、機器狗的模型和它的走路策略。按了才會下載，全篇的儀器共用這一份。",
  error: "載入失敗。",
  retry: "再試一次",
  elsewhere: "機器狗現在在另一個儀器裡。這個儀器佔滿畫面時，牠會自己過來。",
  pause: "暫停",
  play: "繼續",
  reset: "扶正、回到原點",
  fell: "倒了，1.5 秒後扶正",
  stick: "搖桿：上下是前進後退，左右是轉彎",
  stickStrafe: "搖桿：上下是前進後退，左右是橫移",
  stickHint: "拖曳，或先點一下再用方向鍵／WASD。放開就停。",
  strafe: "左右改成橫移",
  asked: "你要的",
  got: "實際的",
  forward: "前進速度",
  turn: "轉彎",
  sideways: "橫移",
  speedTrace: "前進速度：你要的和實際的，最近 8 秒",
  mps: "m/s",
  rps: "rad/s",
  senses: "45 個輸入",
  actions: "12 個輸出",
  blindfold: "蒙住",
  blinded: "已蒙住",
  senseNames: { gyro: "陀螺儀", gravity: "重力方向", command: "指令", jointPos: "關節角度", jointVel: "關節速度", lastAction: "上一次的動作" } satisfies Record<Sense, string>,
  upFor: "站了",
  seconds: "秒",
  fallsCount: "倒地次數",
};

const en: typeof zh = {
  load: "Load the simulator (about 4.5 MB)",
  loading: "Loading…",
  loadNote: "The physics engine, the robot's model and its walking policy. Nothing is downloaded until you ask; every instrument in the article shares this one copy.",
  error: "Failed to load.",
  retry: "Try again",
  elsewhere: "The robot is in another instrument right now. It comes here once this one fills the screen.",
  pause: "Pause",
  play: "Resume",
  reset: "Stand it up at the origin",
  fell: "Down. Back on its feet in 1.5 s",
  stick: "Stick: up and down is forward and back, left and right turns",
  stickStrafe: "Stick: up and down is forward and back, left and right sidesteps",
  stickHint: "Drag, or click it and use the arrow keys / WASD. Let go to stop.",
  strafe: "Left/right sidesteps instead",
  asked: "asked",
  got: "actual",
  forward: "forward speed",
  turn: "turn",
  sideways: "sideways",
  speedTrace: "Forward speed, asked and actual, last 8 seconds",
  mps: "m/s",
  rps: "rad/s",
  senses: "45 inputs",
  actions: "12 outputs",
  blindfold: "Blindfold",
  blinded: "blindfolded",
  senseNames: { gyro: "gyroscope", gravity: "which way is down", command: "command", jointPos: "joint angles", jointVel: "joint speeds", lastAction: "its last action" },
  upFor: "up for",
  seconds: "s",
  fallsCount: "falls",
};

export function useLabels() {
  return usePathname().startsWith("/en") ? en : zh;
}
