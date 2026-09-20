"""Answers one request per line on stdin: {"frames": base64 of k*48*48*3 bytes, "words": [...], "history": [[5 tokens] * 3]}
with the five action tokens the model would take (greedy, one after another). Used by the node evaluation script, so the
world and its pixels stay in TypeScript while the model is still only in PyTorch."""
import base64, json, sys
import numpy as np
import torch
from model import VLA, BINS, SLOTS, IMAGE

checkpoint = torch.load(sys.argv[1], map_location="cpu")
args = checkpoint["args"]
model = VLA(args["frames"], args["d"], args["layers"], proprio=not args.get("no_proprio", False)); model.load_state_dict(checkpoint["state"]); model.eval()
print("ready", flush=True)
for line in sys.stdin:
    request = json.loads(line)
    frames = torch.from_numpy(np.frombuffer(base64.b64decode(request["frames"]), dtype=np.uint8).reshape(1, args["frames"], IMAGE, IMAGE, 3).copy())
    words, tokens, feel = torch.tensor([request["words"]]), sum(request["history"], []), torch.tensor([request["proprio"]], dtype=torch.float32)
    with torch.no_grad():
        for slot in range(SLOTS):
            padded = torch.tensor([tokens + [0] * (SLOTS - slot)])  # what comes after is masked out; the last is never read
            logits = model(frames, words, padded, feel)[0, slot]
            allowed = logits[BINS:] if slot == 4 else logits[:BINS]
            tokens.append(int(allowed.argmax()) + (BINS if slot == 4 else 0))
    print(json.dumps(tokens[-SLOTS:]), flush=True)
