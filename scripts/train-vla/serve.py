"""Answers batches over stdin/stdout, one JSON line each way:
  request  {"frames": base64 of n*k*48*48*3 bytes, "words": [[...]]*n, "history": [[[5 tokens]*3]]*n, "proprio": [[9 floats]]*n}
  response [[5 tokens]]*n   (greedy, one token after another)
The world, its rules and its pixels stay in TypeScript (scripts/train-vla/rollout.ts); only the model is here."""
import base64, json, sys
import numpy as np
import torch
from model import VLA, BINS, SLOTS, IMAGE

checkpoint = torch.load(sys.argv[1], map_location="cpu")
args = checkpoint["args"]
device = "mps" if torch.backends.mps.is_available() else "cpu"
model = VLA(args["frames"], args["d"], args["layers"], proprio=not args.get("no_proprio", False)).to(device)
model.load_state_dict(checkpoint["state"]); model.eval()
print("ready", flush=True)
for line in sys.stdin:
    r = json.loads(line); n = len(r["words"])
    frames = torch.from_numpy(np.frombuffer(base64.b64decode(r["frames"]), dtype=np.uint8).reshape(n, args["frames"], IMAGE, IMAGE, 3).copy()).to(device)
    words, feel = torch.tensor(r["words"], device=device), torch.tensor(r["proprio"], dtype=torch.float32, device=device)
    tokens = torch.tensor([sum(h, []) for h in r["history"]], device=device)
    with torch.no_grad():
        for slot in range(SLOTS):
            padded = torch.cat([tokens, torch.zeros(n, SLOTS - slot, dtype=torch.long, device=device)], 1)  # what follows is masked out
            logits = model(frames, words, padded, feel)[:, slot]
            choice = logits[:, BINS:].argmax(-1) + BINS if slot == 4 else logits[:, :BINS].argmax(-1)
            tokens = torch.cat([tokens, choice[:, None]], 1)
    print(json.dumps(tokens[:, -SLOTS:].tolist()), flush=True)
