"""Behaviour cloning on trajectories exported from the TypeScript world (docs/research/pcb-flip-vla/export-bc.test.ts.txt).

    uv run --with torch --with numpy python scripts/train-vla/train.py --data /path/to/bc --out /path/to/run [--frames 4] [--steps 3000]
"""
import argparse, json, time
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from model import VLA, BINS, HISTORY, SLOTS, IMAGE

STILL = (BINS - 1) // 2


def tokens(action):  # four bins, then open/closed moved past the bins
    return action[:4] + [BINS + action[4]]


def load(data, frames):
    meta = json.loads((Path(data) / "meta.json").read_text())
    pixels = np.memmap(Path(data) / "frames.u8", dtype=np.uint8, mode="r").reshape(-1, IMAGE, IMAGE, 3)
    index, words, acts, feel = [], [], [], []
    for m in meta:
        for t in range(m["length"]):
            index.append([m["start"] + max(0, t - k) for k in range(frames - 1, -1, -1)])
            history = [tokens(m["taken"][t - h]) if t - h >= 0 else [STILL] * 4 + [BINS] for h in range(HISTORY, 0, -1)]
            acts.append(sum(history, []) + tokens(m["labels"][t]))
            words.append(m["instruction"]); feel.append(m["proprio"][t])
    return pixels, np.array(index), np.array(words), np.array(acts), np.array(feel, dtype=np.float32), [m["length"] for m in meta]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=4); ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=128); ap.add_argument("--d", type=int, default=96); ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1); ap.add_argument("--no-proprio", action="store_true")
    args = ap.parse_args()
    torch.manual_seed(args.seed); rng = np.random.default_rng(args.seed)
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    pixels, index, words, acts, feel, lengths = load(args.data, args.frames)
    held = sum(lengths[-len(lengths) // 10:]); train = len(index) - held  # the last tenth of the trajectories is never trained on
    model = VLA(args.frames, args.d, args.layers, proprio=not args.no_proprio).to(device)
    print(f"{sum(p.numel() for p in model.parameters())} parameters, {train} training samples, {held} held out, {device}")
    optimiser = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimiser, max_lr=1e-3, total_steps=args.steps, pct_start=0.05)

    def batch(ids):
        ids = np.sort(ids)
        return (torch.from_numpy(pixels[index[ids]]).to(device), torch.from_numpy(words[ids]).to(device), torch.from_numpy(acts[ids]).to(device), torch.from_numpy(feel[ids]).to(device))

    started = time.time()
    for step in range(1, args.steps + 1):
        frames, w, a, f = batch(rng.integers(0, train, args.batch))
        loss = F.cross_entropy(model(frames, w, a, f).flatten(0, 1), a[:, -SLOTS:].flatten())
        optimiser.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimiser.step(); schedule.step()
        if step % 250 == 0 or step == args.steps:
            model.eval(); right = torch.zeros(SLOTS); seen = 0
            with torch.no_grad():
                for start in range(train, len(index), 512):
                    frames, w, a, f = batch(np.arange(start, min(len(index), start + 512)))
                    right += (model(frames, w, a, f).argmax(-1) == a[:, -SLOTS:]).float().sum(0).cpu(); seen += len(a)
            model.train()
            print(f"step {step}: loss {loss.item():.3f}, held-out accuracy yaw/shoulder/elbow/roll/grip {' '.join(f'{v:.3f}' for v in (right / seen).tolist())}, {time.time() - started:.0f} s", flush=True)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    torch.save({"state": model.state_dict(), "args": vars(args)}, out / "model.pt")


if __name__ == "__main__":
    main()
