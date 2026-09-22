/** The whole language: two boards, two sides, two ways of asking. */
export const VOCAB = ["<pad>", "把", "左邊", "右邊", "的板子", "翻面", "翻到", "正面", "背面", "朝上"] as const;
export const ENGLISH = ["", "turn", "the left", "the right", "board", "over", "so that", "the component side", "the solder side", "is up"] as const;
export const INSTRUCTION_TOKENS = 6;

/** `side`: true = component side up. `null` = "turn it over", whichever side that makes. */
export type Task = { nest: 0 | 1; side: boolean | null };

const id = (word: (typeof VOCAB)[number]) => VOCAB.indexOf(word);

/** Token ids, padded to INSTRUCTION_TOKENS. Nest 0 is on the left as the camera sees it. */
export function encode(task: Task): number[] {
  const words = [id("把"), id(task.nest === 0 ? "左邊" : "右邊"), id("的板子"), ...(task.side === null ? [id("翻面")] : [id("翻到"), id(task.side ? "正面" : "背面"), id("朝上")])];
  while (words.length < INSTRUCTION_TOKENS) words.push(0);
  return words;
}

export const sentence = (tokens: number[], english = false): string => tokens.filter((t) => t > 0).map((t) => (english ? ENGLISH : VOCAB)[t]).join(english ? " " : "");
