import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把 0–100 的量取整，避免结算页出现 87.4 这种数字 */
export function pct(v: number) {
  return Math.round(v);
}
