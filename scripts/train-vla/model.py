"""The VLA as PyTorch sees it. Kept to the operations lib/ml has (linear, layer norm, ReLU, softmax attention) so the
weights can be loaded by the TypeScript forward pass and the two compared number for number."""
import torch
import torch.nn as nn
import torch.nn.functional as F

IMAGE, PATCH, BINS, VOCAB_WORDS, WORDS, HISTORY, SLOTS, PROPRIO = 48, 8, 33, 10, 6, 3, 5, 9
ACTION_VOCAB = BINS + 2  # 33 bins shared by the four joints, then open / closed


class Block(nn.Module):
    def __init__(self, d, heads):
        super().__init__()
        self.heads, self.ln1, self.ln2 = heads, nn.LayerNorm(d), nn.LayerNorm(d)
        self.qkv, self.out = nn.Linear(d, 3 * d, bias=False), nn.Linear(d, d, bias=False)
        self.up, self.down = nn.Linear(d, 4 * d), nn.Linear(4 * d, d)

    def forward(self, x, mask):
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(b, t, 3, self.heads, d // self.heads).permute(2, 0, 3, 1, 4)
        scores = (q @ k.transpose(-1, -2)) / (d // self.heads) ** 0.5
        attention = scores.masked_fill(~mask, float("-inf")).softmax(-1)
        x = x + self.out((attention @ v).transpose(1, 2).reshape(b, t, d))
        return x + self.down(F.relu(self.up(self.ln2(x)))), attention


class VLA(nn.Module):
    def __init__(self, frames=4, d=96, layers=4, heads=6, proprio=True):
        super().__init__()
        self.use_proprio = proprio
        self.feel = nn.Linear(PROPRIO, d)  # one token: what the arm feels of its own joints
        self.frames, self.per_frame = frames, (IMAGE // PATCH) ** 2
        self.patch = nn.Linear(PATCH * PATCH * 3, d)
        self.patch_pos, self.frame_pos = nn.Embedding(self.per_frame, d), nn.Embedding(frames, d)
        self.word, self.word_pos = nn.Embedding(VOCAB_WORDS, d), nn.Embedding(WORDS, d)
        self.action, self.slot, self.step = nn.Embedding(ACTION_VOCAB, d), nn.Embedding(SLOTS, d), nn.Embedding(HISTORY + 1, d)
        self.blocks = nn.ModuleList(Block(d, heads) for _ in range(layers))
        self.ln, self.head = nn.LayerNorm(d), nn.Linear(d, ACTION_VOCAB, bias=False)
        self.prefix = frames * self.per_frame + WORDS + (1 if proprio else 0)
        total = self.prefix + (HISTORY + 1) * SLOTS - 1  # the last action token is only ever a target
        mask = torch.tril(torch.ones(total, total, dtype=torch.bool))
        mask[: self.prefix, : self.prefix] = True  # pictures and words see each other freely; actions are causal
        self.register_buffer("mask", mask)

    def patches(self, frames):  # [b, k, 48, 48, 3] uint8 -> [b, k*36, 192] in 0..1
        b, k = frames.shape[:2]
        x = frames.float().div(255).view(b, k, IMAGE // PATCH, PATCH, IMAGE // PATCH, PATCH, 3).permute(0, 1, 2, 4, 3, 5, 6)
        return x.reshape(b, k * self.per_frame, PATCH * PATCH * 3)

    def forward(self, frames, words, actions, proprio=None, return_attention=False):
        """actions: [b, (HISTORY+1)*SLOTS] tokens, history first; the last one is dropped from the input."""
        b, device = frames.shape[0], frames.device
        p = self.patch(self.patches(frames))
        p = p + self.patch_pos(torch.arange(self.per_frame, device=device).repeat(self.frames)) + self.frame_pos(torch.arange(self.frames, device=device).repeat_interleave(self.per_frame))
        w = self.word(words) + self.word_pos(torch.arange(WORDS, device=device))
        n = actions.shape[1] - 1
        a = self.action(actions[:, :n]) + self.slot(torch.arange(n, device=device) % SLOTS) + self.step(torch.arange(n, device=device) // SLOTS)
        parts = [p, w] + ([self.feel(proprio).unsqueeze(1)] if self.use_proprio else []) + [a]
        x, maps = torch.cat(parts, 1), []
        for block in self.blocks:
            x, attention = block(x, self.mask[: x.shape[1], : x.shape[1]])
            if return_attention: maps.append(attention)
        logits = self.head(self.ln(x[:, -SLOTS:]))  # positions that predict the five current tokens
        return (logits, maps) if return_attention else logits
