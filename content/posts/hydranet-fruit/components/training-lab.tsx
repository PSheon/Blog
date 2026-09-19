"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EdgePlots } from "./edge-plots";
import { type SceneSource, createSceneSource } from "./emoji";
import { useLabels } from "./labels";
import { type Heads, HydraNet, type Prediction } from "./model";
import { boxFromMask } from "./paint";
import { SceneCanvas } from "./scene-canvas";
import { type Scene, boxIoU, maskIoU } from "./scene";
import { mulberry32 } from "@/lib/ml";

const TEST_SIZE = 48;
const SHOWN = 6;
const EVAL_EVERY_MS = 1000;

interface View {
  seen: number;
  box: number;
  mask: number;
  fromMask: number;
  perSec: number;
  boxCurve: number[];
  maskCurve: number[];
  predictions: Prediction[];
  /** The test images on display; kept in state because render must not read the session ref. */
  shown: Scene[];
}

interface Session {
  key: string;
  source: SceneSource;
  net: HydraNet;
  test: Scene[];
  rng: () => number;
  trainMs: number;
  boxCurve: number[];
  maskCurve: number[];
}

function measure(s: Session): View {
  let box = 0, mask = 0, fromMask = 0;
  const predictions: Prediction[] = [];
  s.test.forEach((scene, i) => {
    const p = s.net.predict(scene.image);
    if (i < SHOWN) predictions.push(p);
    box += boxIoU(p.box, scene.box);
    mask += maskIoU(p.mask, scene.mask);
    const derived = boxFromMask(p.mask);
    fromMask += derived ? boxIoU(derived, scene.box) : 0;
  });
  const n = s.test.length;
  return {
    seen: s.net.seen,
    box: box / n,
    mask: mask / n,
    fromMask: fromMask / n,
    perSec: s.trainMs ? (s.net.seen / s.trainMs) * 1000 : 0,
    boxCurve: s.boxCurve,
    maskCurve: s.maskCurve,
    predictions,
    shown: s.test.slice(0, SHOWN),
  };
}

export function TrainingLab() {
  const t = useLabels();
  const rootRef = useRef<HTMLDivElement>(null);
  const [heads, setHeads] = useState<Heads>("both");
  const [running, setRunning] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [kind, setKind] = useState<SceneSource["kind"]>("emoji");
  const session = useRef<Session | null>(null);

  useEffect(() => {
    const key = `${heads}:${epoch}`;
    if (session.current?.key !== key) {
      // Same test images across resets and head choices, so numbers are comparable.
      const source = session.current?.source ?? createSceneSource();
      const test = session.current?.test ?? Array.from({ length: TEST_SIZE }, ((r) => () => source.next(r))(mulberry32(4242)));
      session.current = { key, source, test, net: new HydraNet({ heads, skip: "slim", boxWeight: 1 }), rng: Math.random, trainMs: 0, boxCurve: [], maskCurve: [] };
    }
    const s = session.current;
    let frame = 0, visible = true, lastEval = 0;

    const evaluate = () => {
      const v = measure(s);
      if (s.net.seen > 0) {
        s.boxCurve = [...s.boxCurve, v.box];
        s.maskCurve = [...s.maskCurve, v.mask];
      }
      setKind(s.source.kind);
      setView({ ...v, boxCurve: s.boxCurve, maskCurve: s.maskCurve });
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      // Scoring 48 images costs about as much as training 48: do it once a second, and give it the frame to
      // itself. Training in the same frame made a 70 ms task once a second, which shows when you scroll.
      if (now - lastEval > EVAL_EVERY_MS) {
        lastEval = now;
        evaluate();
        return;
      }
      const t0 = performance.now(), deadline = t0 + 11;
      do s.net.step(Array.from({ length: 8 }, () => s.source.next(s.rng)));
      while (performance.now() < deadline);
      s.trainMs += performance.now() - t0;
    };

    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    if (rootRef.current) io.observe(rootRef.current);
    const first = window.setTimeout(evaluate, 0);
    if (running) frame = requestAnimationFrame(loop);
    return () => {
      window.clearTimeout(first);
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [heads, epoch, running]);

  const shown = view?.shown ?? [];
  const scene = shown[selected];
  const prediction = view?.predictions[selected];
  const trained = (view?.seen ?? 0) > 0;
  const boxOn = heads !== "mask", maskOn = heads !== "box";

  const overlayMask = useMemo(() => (prediction && maskOn ? { values: prediction.mask, threshold: 0 } : undefined), [prediction, maskOn]);
  const overlayBoxes = useMemo(() => {
    if (!scene) return [];
    // Fixed bright colours, not theme tokens: these lines sit on top of a darkened photo in both themes.
    const list = [{ box: scene.box, color: "#ff6e96", dashed: true }];
    if (prediction && boxOn) list.push({ box: prediction.box, color: "#79dafa", dashed: false });
    return list;
  }, [scene, prediction, boxOn]);

  // A caption that reads the plots for the reader, but only claims what is true right now.
  let reading = t.edgesOff;
  if (boxOn && prediction && scene) {
    const peaks = prediction.edges.map((e) => Math.max(...Array.from(e)));
    const sharpest = peaks.indexOf(Math.max(...peaks));
    const errorPx = Math.abs(prediction.box[sharpest] - scene.box[sharpest]) * 32;
    reading = !trained || peaks[sharpest] < 0.2
      ? t.readingFlat
      : peaks[sharpest] >= 0.45 && errorPx < 1.5
        ? t.readingSharp(t.edgeNames[sharpest], (prediction.box[sharpest] * 32).toFixed(1), (scene.box[sharpest] * 32).toFixed(1))
        : t.readingLearning(Math.round(peaks[sharpest] * 100));
  }

  return (
    <div ref={rootRef} className="grid gap-7">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button size="lg" onClick={() => setRunning(!running)} data-testid="hy-train">
          {running ? <Pause /> : <Play />}
          {running ? t.pause : trained ? t.resume : t.train}
        </Button>
        <div className="flex items-center gap-1.5" role="group" aria-label={t.heads}>
          <span className="label mr-1">{t.heads}</span>
          {(["both", "box", "mask"] as Heads[]).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={heads === h}
              onClick={() => {
                setRunning(false);
                setHeads(h);
              }}
              className={cn(
                "h-7 rounded-sm border px-2.5 text-xs transition-colors",
                heads === h ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.headNames[h]}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setRunning(false);
            setEpoch((e) => e + 1);
          }}
        >
          <RotateCcw />
          {t.reset}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8">
        <div className="grid content-start gap-3">
          <SceneCanvas image={scene?.image ?? null} mask={overlayMask} boxes={overlayBoxes} label={t.testSet} />
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label={t.testSet}>
            {shown.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selected === i}
                aria-label={`${t.testSet} ${i + 1}`}
                onClick={() => setSelected(i)}
                className={cn("rounded-sm border p-px transition-colors", selected === i ? "border-signal" : "border-border hover:border-foreground/40")}
              >
                <SceneCanvas image={s.image} label="" className="rounded-[1px] border-0" />
              </button>
            ))}
          </div>
          <ul className="label grid gap-1">
            <li><span className="text-signal">━</span> {t.legendPred}</li>
            <li><span className="text-signal-2">┅</span> {t.legendTruth}</li>
            <li><span className="text-foreground">■</span> {t.legendMask}</li>
          </ul>
        </div>

        <div className="grid content-start gap-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Readout label={t.seen} value={<span data-testid="hy-seen">{(view?.seen ?? 0).toLocaleString("en-US")}</span>} tone="plain" />
            <Readout label={t.boxIou} value={<span data-testid="hy-box">{boxOn && view ? view.box.toFixed(2) : "–"}</span>} large />
            <Readout label={t.maskIou} value={<span data-testid="hy-mask">{maskOn && view ? view.mask.toFixed(2) : "–"}</span>} tone="alt" large />
            <Readout label={t.speed} value={view?.perSec ? Math.round(view.perSec) : "–"} unit={t.perSec} tone="plain" />
          </div>
          {maskOn && (
            <p className="label">
              {t.fromMask}: <span className="text-foreground tabular">{view ? view.fromMask.toFixed(2) : "–"}</span>
            </p>
          )}

          {view && view.boxCurve.length > 1 ? (
            <div>
              <p className="label mb-1">{t.curve}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {boxOn && <Sparkline values={view.boxCurve} label={t.boxIou} window={200} />}
                {maskOn && <Sparkline values={view.maskCurve} label={t.maskIou} window={200} />}
              </div>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t.untrained}</p>
          )}
          {kind === "shapes" && <p className="text-xs leading-relaxed text-signal-2">{t.fallback}</p>}

          <div className="grid gap-3 border-t border-border pt-5">
            <p className="text-sm font-medium">{t.edges}</p>
            {boxOn && prediction && scene && (
              <EdgePlots edges={prediction.edges} predicted={[...prediction.box]} truth={[...scene.box]} names={t.edgeNames} />
            )}
          </div>
        </div>
      </div>

      <p className="rounded-md border border-signal/30 bg-signal/5 px-3.5 py-3 text-sm leading-relaxed" data-testid="hy-reading">
        {reading}
      </p>
    </div>
  );
}
