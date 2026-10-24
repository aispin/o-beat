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

import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

NO_STORE = ('/', '/index.html', '/sw.js', '/version.json', '/manifest.webmanifest')


class Handler(http.server.SimpleHTTPRequestHandler):
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
