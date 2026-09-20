import contextlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import os
import socket
import threading
import unittest
from unittest.mock import patch
import irm


class PortProbeTests(unittest.TestCase):
    def server(self, family):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')

            def log_message(self, *args):
                pass

        class Server(HTTPServer):
            address_family = family

            def server_bind(self):
                if family == socket.AF_INET6:
                    self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                super().server_bind()

        try:
            server = Server(('::1' if family == socket.AF_INET6 else '127.0.0.1', 0), Handler)
        except OSError as error:
            if family == socket.AF_INET6:
                self.skipTest(f'IPv6 loopback unavailable: {error}')
            raise
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join, 2)
        self.addCleanup(server.shutdown)
        return server

    def test_ipv6_only_listener_is_occupied_and_released_after_shutdown(self):
        server = self.server(socket.AF_INET6)
        port = server.server_port
        with socket.socket(socket.AF_INET) as ipv4:
            self.assertNotEqual(ipv4.connect_ex(('127.0.0.1', port)), 0)
        self.assertEqual(irm.listening_host(port), '::1')
        self.assertTrue(irm.occupied(port))
        server.shutdown()
        server.server_close()
        self.assertFalse(irm.occupied(port))

    def test_ipv4_listener_still_works(self):
        server = self.server(socket.AF_INET)
        self.assertEqual(irm.listening_host(server.server_port), '127.0.0.1')
        self.assertTrue(irm.occupied(server.server_port))

    def test_doctor_reaches_ipv6_only_http_server_without_using_a_proxy(self):
        server = self.server(socket.AF_INET6)
        stream = io.StringIO()
        with patch.object(irm, 'SERVICES', {'dev': server.server_port}), patch.object(irm, 'status_lines', return_value=[]), patch.object(irm, 'supabase_settings', return_value=('', '')), patch.dict(os.environ, {'http_proxy': 'http://127.0.0.1:1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'no_proxy': '', 'NO_PROXY': ''}), contextlib.redirect_stdout(stream):
            irm.doctor()
        self.assertIn('dev: HTTP 200', stream.getvalue())
        self.assertNotIn('dev: unavailable', stream.getvalue())

    def test_disabled_ipv6_is_treated_as_an_unoccupied_port(self):
        real_socket = socket.socket
        with real_socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
            def available_socket(family, kind):
                if family == socket.AF_INET6:
                    raise OSError('IPv6 disabled')
                return real_socket(family, kind)
            with patch.object(irm.socket, 'socket', side_effect=available_socket):
                self.assertFalse(irm.occupied(port))

    def test_doctor_reports_an_unoccupied_port_without_an_http_request(self):
        with patch.object(irm, 'SERVICES', {'dev': 3000}), patch.object(irm, 'status_lines', return_value=[]), patch.object(irm, 'supabase_settings', return_value=('', '')), patch.object(irm, 'listening_host', return_value=None), patch.object(irm.urllib.request, 'build_opener') as opener, contextlib.redirect_stdout(io.StringIO()) as stream:
            irm.doctor()
        opener.return_value.open.assert_not_called()
        self.assertIn('dev: unavailable (no loopback listener)', stream.getvalue())
