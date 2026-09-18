import { conv2d, dense, flatten, maxPool2d, relu, softmax } from "./ops";
import { type Tensor, tensor } from "./tensor";

export type LayerSpec =
  | { type: "conv2d"; name: string; inC: number; outC: number; kernel: number; padding: number }
  | { type: "relu"; name: string }
  | { type: "maxpool"; name: string; size: number }
  | { type: "flatten"; name: string }
  | { type: "dense"; name: string; inF: number; outF: number }
  | { type: "softmax"; name: string };

/** Keys are "<layer>.weight" / "<layer>.bias", matching a PyTorch state_dict. */
export type Weights = Record<string, { shape: number[]; data: number[] }>;

export interface Activation {
  name: string;
  type: LayerSpec["type"];
  output: Tensor;
}

function load(weights: Weights, key: string, expected: number[]): Tensor {
  const entry = weights[key];
  if (!entry) throw new Error(`weights: missing "${key}"`);
  const same =
    entry.shape.length === expected.length &&
    entry.shape.every((d, i) => d === expected[i]);
  if (!same) {
    throw new Error(
      `weights: "${key}" has shape [${entry.shape.join(", ")}], expected [${expected.join(", ")}]`,
    );
  }
  return tensor(entry.data, entry.shape);
}

type Step = (x: Tensor) => Tensor;

/**
 * A feed-forward stack that keeps every intermediate activation, because the
 * articles visualise what happens between the layers, not just the answer.
 */
export class Sequential {
  readonly layers: LayerSpec[];
  private readonly steps: Step[];

  constructor(layers: LayerSpec[], weights: Weights) {
    this.layers = layers;
    this.steps = layers.map((l): Step => {
      switch (l.type) {
        case "conv2d": {
          const w = load(weights, `${l.name}.weight`, [l.outC, l.inC, l.kernel, l.kernel]);
          const b = load(weights, `${l.name}.bias`, [l.outC]);
          return (x) => conv2d(x, w, b, { padding: l.padding });
        }
        case "dense": {
          const w = load(weights, `${l.name}.weight`, [l.outF, l.inF]);
          const b = load(weights, `${l.name}.bias`, [l.outF]);
          return (x) => dense(x, w, b);
        }
        case "relu":
          return relu;
        case "maxpool":
          return (x) => maxPool2d(x, l.size);
        case "flatten":
          return flatten;
        case "softmax":
          return softmax;
      }
    });
  }

  forward(x: Tensor): Activation[] {
    const activations: Activation[] = [];
    let current = x;
    this.layers.forEach((layer, i) => {
      current = this.steps[i](current);
      activations.push({ name: layer.name, type: layer.type, output: current });
    });
    return activations;
  }

  predict(x: Tensor): Float32Array {
    const acts = this.forward(x);
    return acts[acts.length - 1].output.data;
  }
}

/** The digit classifier used by the CNN article. ~9k parameters. */
export const MNIST_CNN: LayerSpec[] = [
  { type: "conv2d", name: "conv1", inC: 1, outC: 8, kernel: 3, padding: 1 },
  { type: "relu", name: "relu1" },
  { type: "maxpool", name: "pool1", size: 2 },
  { type: "conv2d", name: "conv2", inC: 8, outC: 16, kernel: 3, padding: 1 },
  { type: "relu", name: "relu2" },
  { type: "maxpool", name: "pool2", size: 2 },
  { type: "flatten", name: "flatten" },
  { type: "dense", name: "fc", inF: 784, outF: 10 },
  { type: "softmax", name: "softmax" },
];
