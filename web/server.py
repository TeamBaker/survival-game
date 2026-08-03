#!/usr/bin/env python3
"""
Hermes 3D Engine — static file server
=====================================
Serves this directory over HTTP on port 8081, bound to all interfaces so a
phone on the same Wi-Fi can load it.

Run with: python3 server.py  [port]
"""

import functools
import http.server
import os
import socket
import socketserver
import sys

DEFAULT_PORT = 8081
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with caching disabled so edits show up on reload."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write('  %s  %s\n' % (self.address_string(), fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def lan_ip():
    """Best-effort local network address (no packets are actually sent)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8', 80))
        return sock.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        sock.close()


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            sys.exit('usage: python3 server.py [port]')

    handler = functools.partial(Handler, directory=DIRECTORY)

    try:
        httpd = Server(('0.0.0.0', port), handler)
    except OSError as exc:
        sys.exit('Could not bind port %d: %s' % (port, exc))

    bar = '=' * 62
    print(bar)
    print('Hermes 3D Engine — Web')
    print(bar)
    print('  Serving   %s' % DIRECTORY)
    print('  Local     http://localhost:%d/' % port)
    print('  Network   http://%s:%d/     <- open this on your phone' % (lan_ip(), port))
    print('  Ctrl+C    Stop')
    print(bar)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
