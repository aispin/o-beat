/* localStorage 不是哪儿都能碰：Safari 无痕、iOS 关掉跨站跟踪、
   部分 App 内置浏览器都会直接抛 SecurityError。
   只有「记不住」这点后果，不值得让一次读写在渲染路径上炸掉整个页面。 */

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 存不下就算了 */
    }
  },
};
