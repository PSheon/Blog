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
    { id: "foot", title: "走路", keys: [["W A S D", "移動"], ["Shift", "衝刺"], ["Space", "跳"], ["F", "搭上旁邊的載具（駕駛）"], ["G", "搭上去當乘客"], ["滑鼠", "轉動鏡頭"], ["Esc", "放開滑鼠，再按一次收合"]] },
    { id: "car", title: "車", keys: [["W S", "油門、倒車"], ["A D", "方向；在空中是翻滾"], ["Space", "煞車"], ["X", "換座位"], ["V", "第一人稱"], ["F", "下車（慢速時先煞停）"]] },
    { id: "riding", title: "乘客座", keys: [["X", "換到旁邊的座位"], ["V", "第一人稱"], ["F", "下車"], ["滑鼠", "轉動鏡頭"]] },
    { id: "heli", title: "直升機", keys: [["Shift", "上升"], ["Space", "下降"], ["W S", "前傾、後仰"], ["A D", "左右側傾"], ["Q E", "原地轉向"], ["X", "換座位"], ["V", "第一人稱"], ["F", "離開"]] },
    { id: "plane", title: "飛機", keys: [["Shift", "油門（按住）"], ["S W", "拉起、壓低機頭（升降舵）"], ["A D", "壓坡度（副翼）"], ["Q E", "方向舵；在地上是轉向"], ["Space", "減速"], ["B", "輪煞"], ["V", "第一人稱"], ["F", "跳機"]] },
  ] as { id: string; title: string; keys: [string, string][] }[],
  lockOff: "點一下畫面，滑鼠就用來轉鏡頭；Esc 收合", lockOffArticle: "點一下畫面，滑鼠就用來轉鏡頭", lockOn: "滑鼠轉鏡頭中　按 Esc 放開滑鼠",
  enter: "進入遊樂園", entering: "正在下載人物、載具和物理引擎…",
  carry: "沿用上一幀", denoise: "向鄰居借（降噪）",
  place: "帶我去", placeCar: "車", placeHeli: "直升機", placePlane: "飛機",
  hour: "太陽的時間", spp: "累積的樣本", msPerSample: "一個樣本", ms: "ms", movingTriangles: "會動的三角形", treeMs: "每幀重蓋它們的樹", rendered: "實際算的解析度", jump: "跳", getIn: "上去 (F)", getOut: "下來 (F)", brake: "煞車", switchSeat: "換座位 (X)", climb: "上升／油門", descend: "下降／煞車",
  stick: "移動：拖曳搖桿，或選取它之後用方向鍵、W A S D",
  hint: "先點一下畫面：滑鼠轉鏡頭（Esc 放開），W A S D 走路，走到車、直升機或飛機旁按 F。觸控用搖桿和拖曳。人一動，累積的樣本就全部作廢，畫面回到雜訊；站著不動，它就慢慢變清楚。",
  help: "操作說明", helpTouch: "觸控：左下角的搖桿移動，拖曳畫面轉鏡頭；右下角的按鈕依序是換座位、上下車、下降或煞車、跳或上升。直升機的搖桿左右是轉向。",
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
    { id: "foot", title: "On foot", keys: [["W A S D", "move"], ["Shift", "sprint"], ["Space", "jump"], ["F", "get into what is next to you, to drive"], ["G", "get in as a passenger"], ["mouse", "turn the camera"], ["Esc", "release the mouse; again to collapse"]] },
    { id: "car", title: "Car", keys: [["W S", "throttle, reverse"], ["A D", "steer; in the air, roll"], ["Space", "brake"], ["X", "switch seats"], ["V", "first person"], ["F", "get out (slow, it stops first)"]] },
    { id: "riding", title: "Passenger seat", keys: [["X", "slide over to the next seat"], ["V", "first person"], ["F", "get out"], ["mouse", "turn the camera"]] },
    { id: "heli", title: "Helicopter", keys: [["Shift", "climb"], ["Space", "descend"], ["W S", "tilt forward, back"], ["A D", "roll left, right"], ["Q E", "turn on the spot"], ["X", "switch seats"], ["V", "first person"], ["F", "leave"]] },
    { id: "plane", title: "Aeroplane", keys: [["Shift", "throttle (hold)"], ["S W", "nose up, down (elevators)"], ["A D", "bank (ailerons)"], ["Q E", "rudder; steering on the ground"], ["Space", "slow down"], ["B", "wheel brake"], ["V", "first person"], ["F", "bail out"]] },
  ] as { id: string; title: string; keys: [string, string][] }[],
  lockOff: "Click the world and the mouse turns the camera; Esc collapses", lockOffArticle: "Click the world and the mouse turns the camera", lockOn: "The mouse turns the camera. Press Esc to release it",
  enter: "Enter the playground", entering: "Fetching the character, the vehicles and the physics engine…",
  carry: "Carry the last frame over", denoise: "Borrow from neighbours (denoise)",
  place: "Take me to", placeCar: "a car", placeHeli: "the helicopter", placePlane: "the aeroplane",
  hour: "Time of day", spp: "Samples so far", msPerSample: "One sample", ms: "ms", movingTriangles: "Triangles that move", treeMs: "Their tree, rebuilt per frame", rendered: "Pixels actually rendered", jump: "Jump", getIn: "Get in (F)", getOut: "Get out (F)", brake: "Brake", switchSeat: "Switch seats (X)", climb: "Up / throttle", descend: "Down / brake",
  stick: "Move: drag the stick, or focus it and use the arrow keys or W A S D",
  hint: "Click the picture first: the mouse turns the camera (Esc releases it), W A S D walk, and F beside a car, the helicopter or the aeroplane gets in. On touch, use the stick and drag. Any movement throws away every sample so far and the picture is noise again; stand still and it clears.",
  help: "Controls", helpTouch: "Touch: the stick in the corner moves, dragging the picture turns the camera; the buttons on the right are switch seats, get in or out, down or brake, and jump or up. In the helicopter the stick's sideways half turns it.",
};

export type Labels = typeof zh;
export function useLabels(): Labels { return useLocaleLabels(zh, en); }
