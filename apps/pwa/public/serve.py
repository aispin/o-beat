#!/usr/bin/env python3
"""分享域名用的静态服务器。

默认的 `python3 -m http.server` 不区分文件类型，一个缓存头都不给，
CDN 于是按自己的默认策略把 HTML 也缓存很久。后果是：发布新版本后用户拿到的
还是旧 HTML，而它引用的、带 hash 的 JS 已经随新构建从服务器上删掉了 ——
页面永远白屏，刷新多少次都一样。

这里按类型分开：
  HTML / sw.js / version.json / manifest  → no-store，每次回源
  /assets/*（文件名里带 hash，内容变了名字就变） → immutable，缓存一年
"""

import glob
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

NO_STORE = ('/', '/index.html', '/sw.js', '/version.json', '/manifest.webmanifest')


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self._remap_stale_asset()
        super().do_GET()

    def _remap_stale_asset(self):
        """旧 HTML 引用的是上一版带 hash 的文件名，构建后那个文件已经不在了。

        浏览器（或 CDN）还攥着旧 HTML 时，请求 /assets/index-BKsViNK4.js 会直接 404，
        网关再把 404 包成 403 的错误页 —— 用户看到的就是白屏，而且刷新多少次都一样。
        这里把它落到当前同扩展名的产物上：文件名只是 hash，内容是不是当初那份并不重要，
        反正 HTML 引的入口只有 index；关键是页面能起来。
        """
        path = self.path.split('?', 1)[0]
        if not path.startswith('/assets/') or os.path.exists(self.translate_path(path)):
            return
        ext = os.path.splitext(path)[1]
        if ext not in ('.js', '.css'):
            return
        candidates = glob.glob(os.path.join(ROOT, 'assets', 'index-*' + ext))
        if not candidates:
            return
        newest = max(candidates, key=os.path.getmtime)
        self.path = '/assets/' + os.path.basename(newest)

    def end_headers(self):
        path = self.path.split('?', 1)[0]
        if path.startswith('/assets/'):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        elif path.endswith('.html') or path in NO_STORE:
            self.send_header('Cache-Control', 'no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
        else:
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 反向代理的健康检查很吵，日志只留错误
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '3000'))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('0.0.0.0', port), Handler) as httpd:
        print('serving %s on 0.0.0.0:%d' % (ROOT, port), flush=True)
        httpd.serve_forever()
