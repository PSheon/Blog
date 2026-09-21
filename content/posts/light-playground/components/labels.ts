"use client";

import { useLocaleLabels } from "@/components/lab/use-locale-labels";

const zh = {
  picture: "Sketchbook 的遊樂園，由你的 GPU 即時路徑追蹤。你操控的人站在中間，拖曳轉動鏡頭。",
  start: "開始", pause: "暫停", restart: "重來",
  building: "正在下載遊樂園、蓋 BVH…", fallbackNote: "",
  noWebgpu: "這個瀏覽器沒有 WebGPU，這張圖需要它。請用新版的 Chrome、Edge 或 Safari 26 打開。",
  noAdapter: "瀏覽器有 WebGPU，但沒有 GPU 回應（可能被停用，或是在遠端桌面裡）。",
  failed: "GPU 啟動失敗了（驅動程式拒絕了這段著色器，或裝置中途斷線）。細節在瀏覽器的主控台。",
  mode: "怎麼畫", raster: "光柵", direct: "只有直接光", full: "完整光追",
  expand: "展開", collapse: "收合", settings: "設定", sppShort: "樣本",
  legend: [
    { id: "foot", title: "走路", keys: [["W A S D", "移動"], ["Shift", "衝刺"], ["Space", "跳"], ["F", "搭上旁邊的載具"], ["滑鼠", "轉動鏡頭"], ["Esc", "放開滑鼠，再按一次收合"]] },
    { id: "car", title: "車", keys: [["W S", "油門、倒車"], ["A D", "方向"], ["Space", "煞車"], ["F", "下車"]] },
    { id: "heli", title: "直升機", keys: [["Space", "上升"], ["Shift", "下降"], ["W S", "前傾、後仰"], ["A D", "轉向"], ["F", "離開"]] },
    { id: "plane", title: "飛機", keys: [["Space", "油門（按住）"], ["S", "拉起機頭"], ["W", "壓低機頭"], ["A D", "壓坡度轉彎"], ["Shift", "煞車"], ["F", "跳機"]] },
  ] as { id: string; title: string; keys: [string, string][] }[],
  lockOff: "點一下畫面，滑鼠就用來轉鏡頭；Esc 收合", lockOffArticle: "點一下畫面，滑鼠就用來轉鏡頭", lockOn: "滑鼠轉鏡頭中　按 Esc 放開滑鼠",
  carry: "沿用上一幀", denoise: "向鄰居借（降噪）",
  place: "帶我去", placeCar: "車", placeHeli: "直升機", placePlane: "飛機",
  hour: "太陽的時間", spp: "累積的樣本", msPerSample: "一個樣本", ms: "ms", movingTriangles: "會動的三角形", treeMs: "每幀重蓋它們的樹", jump: "跳", getIn: "上去 (F)", getOut: "下來 (F)", brake: "煞車", climb: "上升／油門", descend: "下降／煞車",
  stick: "移動：拖曳搖桿，或選取它之後用方向鍵、W A S D",
  hint: "用滑鼠的話，點一下畫面，滑鼠就直接轉動鏡頭，按 Esc 放開；觸控則是拖曳。點過畫面之後，用 W A S D 或方向鍵走路，Shift 衝刺，空白鍵跳；走到車、直升機或飛機旁按 F 上去，再按一次下來。車：同樣的鍵是油門、方向，空白鍵煞車。直升機：空白鍵上升、Shift 下降，前後鍵前傾後仰，左右鍵轉向，放手就懸停。飛機：按住空白鍵加油門，速度夠了把後鍵（S）按住拉起機頭，左右鍵壓坡度轉彎，Shift 煞車；手機用左下角的搖桿和右下角的「跳」。人一動，累積的樣本就全部作廢，畫面回到雜訊；站著不動，它就慢慢變清楚。",
};

const en: typeof zh = {
  picture: "Sketchbook's playground, path traced live on your GPU. Drag to look around.",
  start: "Start", pause: "Pause", restart: "Restart",
  building: "Fetching the playground and building its BVH…", fallbackNote: "",
  noWebgpu: "This browser has no WebGPU, and this figure needs it. Open it in a recent Chrome, Edge or Safari 26.",
  noAdapter: "The browser has WebGPU but no GPU answered (it may be disabled, or this is a remote desktop).",
  failed: "The GPU did not start (the driver rejected the shader, or the device was lost). The details are in the browser console.",
  mode: "Drawn by", raster: "Raster", direct: "Direct light only", full: "Full path tracing",
  expand: "Expand", collapse: "Collapse", settings: "Settings", sppShort: "samples",
  legend: [
    { id: "foot", title: "On foot", keys: [["W A S D", "move"], ["Shift", "sprint"], ["Space", "jump"], ["F", "get into what is next to you"], ["mouse", "turn the camera"], ["Esc", "release the mouse; again to collapse"]] },
    { id: "car", title: "Car", keys: [["W S", "throttle, reverse"], ["A D", "steer"], ["Space", "brake"], ["F", "get out"]] },
    { id: "heli", title: "Helicopter", keys: [["Space", "climb"], ["Shift", "descend"], ["W S", "tilt forward, back"], ["A D", "turn"], ["F", "leave"]] },
    { id: "plane", title: "Aeroplane", keys: [["Space", "throttle (hold)"], ["S", "nose up"], ["W", "nose down"], ["A D", "bank into a turn"], ["Shift", "brake"], ["F", "bail out"]] },
  ] as { id: string; title: string; keys: [string, string][] }[],
  lockOff: "Click the world and the mouse turns the camera; Esc collapses", lockOffArticle: "Click the world and the mouse turns the camera", lockOn: "The mouse turns the camera. Press Esc to release it",
  carry: "Carry the last frame over", denoise: "Borrow from neighbours (denoise)",
  place: "Take me to", placeCar: "a car", placeHeli: "the helicopter", placePlane: "the aeroplane",
  hour: "Time of day", spp: "Samples so far", msPerSample: "One sample", ms: "ms", movingTriangles: "Triangles that move", treeMs: "Their tree, rebuilt per frame", jump: "Jump", getIn: "Get in (F)", getOut: "Get out (F)", brake: "Brake", climb: "Up / throttle", descend: "Down / brake",
  stick: "Move: drag the stick, or focus it and use the arrow keys or W A S D",
  hint: "With a mouse, click the picture and the mouse turns the camera (Esc releases it); on touch, drag. Once it is clicked, walk with W A S D or the arrow keys, Shift to sprint, Space to jump; walk up to a car, the helicopter or the aeroplane and press F to get in, and again to get out. Car: the same keys are throttle and steering, Space brakes. Helicopter: Space climbs, Shift descends, forward and back tilt it, left and right turn it, and letting go hovers. Aeroplane: hold Space for throttle, at speed hold back (S) to lift the nose, left and right bank into a turn, Shift brakes; on a phone use the stick in the corner and the Jump button. Any movement throws away every sample so far and the picture is noise again; stand still and it clears.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
