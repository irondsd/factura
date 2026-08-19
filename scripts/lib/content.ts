import { missingKeywordWords } from "../../src/content-system/validation/text";

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, value: string) =>
  color ? `\x1b[${code}m${value}\x1b[0m` : value;

export const red = (value: string) => paint(31, value);
export const yellow = (value: string) => paint(33, value);
export const green = (value: string) => paint(32, value);
export const dim = (value: string) => paint(2, value);
export const bold = (value: string) => paint(1, value);
export { missingKeywordWords };
