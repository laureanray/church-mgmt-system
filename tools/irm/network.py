"""Resolve browser addresses without making local development depend on a VPN."""
import ipaddress
import os
import platform
import shutil
import subprocess

MODES = ('auto', 'local', 'lan', 'tailscale')


def output(args):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=3).stdout.strip()


def reachable_ip(value):
    try:
        address = ipaddress.ip_address(value)
        return str(address) if not (address.is_loopback or address.is_unspecified or address.is_link_local) else None
    except ValueError:
        return None


def tailscale_address():
    if shutil.which('tailscale'):
        try:
            value = output(['tailscale', 'ip', '-4']).splitlines()
            if value and (host := reachable_ip(value[0])):
                return host
        except (OSError, subprocess.SubprocessError):
            pass
    raise ValueError('No Tailscale address found. Connect Tailscale or use irm network local.')


def lan_address():
    try:
        if platform.system() == 'Darwin':
            route = output(['/sbin/route', '-n', 'get', 'default'])
            device = next((line.split(':', 1)[1].strip() for line in route.splitlines()
                           if line.strip().startswith('interface:')), None)
            if device and (host := reachable_ip(output(['/usr/sbin/ipconfig', 'getifaddr', device]))):
                return host
        else:
            import json
            routes = json.loads(output(['ip', '-j', '-4', 'route', 'show', 'default']))
            for route in routes:
                device = route.get('dev')
                if device and device != 'tailscale0':
                    interfaces = json.loads(output(['ip', '-j', '-4', 'address', 'show', 'dev', device]))
                    for interface in interfaces:
                        for info in interface.get('addr_info', []):
                            if info.get('scope') == 'global' and (host := reachable_ip(info.get('local', ''))):
                                return host
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    raise ValueError('No LAN address found. Connect Wi-Fi/Ethernet or use irm network local.')


def address(mode='auto'):
    if mode not in MODES:
        raise ValueError(f'Unknown network mode: {mode}. Choose auto, local, lan, or tailscale.')
    if mode == 'local':
        return 'localhost'
    if mode == 'lan':
        return lan_address()
    if mode == 'tailscale':
        return tailscale_address()
    # A Mac is a local workstation by default, even if Tailscale is connected
    # or an inherited tmux environment still contains SSH variables.
    if platform.system() == 'Darwin':
        return 'localhost'
    # On a remote Linux host, use the server address used by this SSH session.
    # That naturally selects Tailscale for Tailscale SSH and LAN for LAN SSH.
    connection = os.environ.get('SSH_CONNECTION', '').split()
    if len(connection) == 4 and (host := reachable_ip(connection[2])):
        return host
    if os.environ.get('SSH_CONNECTION') or os.environ.get('SSH_CLIENT') or os.environ.get('SSH_TTY'):
        try:
            return tailscale_address()
        except ValueError:
            return lan_address()
    return 'localhost'


def url_host(host):
    return f'[{host}]' if ':' in host else host
