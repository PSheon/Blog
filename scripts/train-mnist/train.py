"""Train the digit classifier used by the "CNN from scratch" article.

Run once from the repo root:

    uv run --with torch --with torchvision --with numpy python scripts/train-mnist/train.py

Writes
  content/posts/cnn-from-scratch/weights.json   weights, rounded to 4 decimals
  tests/fixtures/mnist-golden.json              one input + expected outputs

The architecture must stay in sync with MNIST_CNN in lib/ml/sequential.ts.
Inputs are raw [0, 1] ink values — no mean/std normalisation — so the browser
can feed canvas pixels straight in.
"""

import json
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "data"
WEIGHTS_OUT = ROOT / "content/posts/cnn-from-scratch/weights.json"
GOLDEN_OUT = ROOT / "tests/fixtures/mnist-golden.json"

EPOCHS = 6
DECIMALS = 4


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 8, 3, padding=1)
        self.conv2 = nn.Conv2d(8, 16, 3, padding=1)
        self.fc = nn.Linear(16 * 7 * 7, 10)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.conv1(x)), 2)
        x = F.max_pool2d(F.relu(self.conv2(x)), 2)
        return self.fc(torch.flatten(x, 1))


def evaluate(model, loader):
    model.eval()
    correct = 0
    with torch.no_grad():
        for x, y in loader:
            correct += (model(x).argmax(1) == y).sum().item()
    return correct / len(loader.dataset)


def main():
    torch.manual_seed(0)
    # Hand-drawn canvas digits are sloppier than MNIST: vary position, tilt, size.
    augment = transforms.Compose([
        transforms.RandomAffine(degrees=10, translate=(0.1, 0.1), scale=(0.85, 1.15)),
        transforms.ToTensor(),
    ])
    train = datasets.MNIST(DATA, train=True, download=True, transform=augment)
    test = datasets.MNIST(DATA, train=False, download=True, transform=transforms.ToTensor())
    train_loader = DataLoader(train, batch_size=128, shuffle=True)
    test_loader = DataLoader(test, batch_size=1000)

    model = Net()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    sched = torch.optim.lr_scheduler.StepLR(opt, step_size=2, gamma=0.5)

    for epoch in range(EPOCHS):
        model.train()
        for x, y in train_loader:
            opt.zero_grad()
            F.cross_entropy(model(x), y).backward()
            opt.step()
        sched.step()
        print(f"epoch {epoch + 1}/{EPOCHS}  test acc {evaluate(model, test_loader):.4f}")

    # Round first, then measure: the shipped numbers are the ones that must hold.
    with torch.no_grad():
        for p in model.parameters():
            p.copy_(torch.round(p * 10**DECIMALS) / 10**DECIMALS)
    acc = evaluate(model, test_loader)
    print(f"rounded weights  test acc {acc:.4f}")
    assert acc >= 0.98, "accuracy below the 98% target"

    weights = {
        name: {"shape": list(t.shape), "data": [round(v, DECIMALS) for v in t.flatten().tolist()]}
        for name, t in model.state_dict().items()
    }
    WEIGHTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    WEIGHTS_OUT.write_text(json.dumps({"accuracy": round(acc, 4), "weights": weights}, separators=(",", ":")))

    model.eval()
    x, label = test[0]
    with torch.no_grad():
        logits = model(x.unsqueeze(0))[0]
        probs = F.softmax(logits, dim=0)
    GOLDEN_OUT.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_OUT.write_text(json.dumps({
        "label": int(label),
        "input": [round(v, 6) for v in x.flatten().tolist()],
        "logits": logits.tolist(),
        "probs": probs.tolist(),
    }, separators=(",", ":")))
    print(f"wrote {WEIGHTS_OUT.relative_to(ROOT)} ({WEIGHTS_OUT.stat().st_size / 1024:.0f} KB)")
    print(f"wrote {GOLDEN_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
