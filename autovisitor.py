#!/usr/bin/env python3
"""
AutoVisitor - Boost website traffic using Webshare rotating proxies
Usage: python autovisitor.py <url> [options]
"""

import os
import sys
import time
import random
import argparse
import itertools

try:
    import requests
except ImportError:
    print("Error: 'requests' library not found. Run: pip install requests")
    sys.exit(1)

# ── Webshare API ──────────────────────────────────────────────────────────────
WEBSHARE_API_BASE = "https://proxy.webshare.io/api/v2"

# ── Random User-Agents to mimic real browsers ─────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
]

ACCEPT_HEADERS = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
]

# Max consecutive failures before a proxy is quarantined for the rest of the run
MAX_PROXY_FAILURES = 3
# Max retries per visit slot before giving up
MAX_RETRIES = 3


# ── Webshare Functions ────────────────────────────────────────────────────────

def get_proxy_list(token, mode="direct"):
    """
    Fetch the full proxy list from Webshare API, following pagination.
    mode: 'direct' or 'backbone'
    """
    headers = {"Authorization": "Token {}".format(token)}
    proxies = []
    page = 1
    page_size = 100

    while True:
        params = {"mode": mode, "page": page, "page_size": page_size}
        try:
            resp = requests.get(
                "{}/proxy/list/".format(WEBSHARE_API_BASE),
                headers=headers,
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                print("[ERROR] Invalid Webshare API token. Check WEBSHARE_API_TOKEN.")
            else:
                print("[ERROR] Failed to fetch proxies (page {}): {}".format(page, e))
            break
        except Exception as e:
            print("[ERROR] Could not connect to Webshare API: {}".format(e))
            break

        data = resp.json()
        batch = data.get("results", [])
        proxies.extend(batch)

        # Webshare uses 'next' field (URL string or null) for pagination
        if not data.get("next"):
            break
        page += 1

    return proxies


def format_proxy(proxy_obj):
    """Convert Webshare proxy object to requests-compatible dict."""
    username = proxy_obj.get("username", "")
    password = proxy_obj.get("password", "")
    host = proxy_obj.get("proxy_address", "")
    port = proxy_obj.get("port", 80)
    proxy_url = "http://{}:{}@{}:{}".format(username, password, host, port)
    return {"http": proxy_url, "https": proxy_url}


def proxy_label(proxy_obj):
    return "{}:{}".format(proxy_obj.get("proxy_address", "?"), proxy_obj.get("port", "?"))


# ── Rotating pool ─────────────────────────────────────────────────────────────

class ProxyPool:
    """
    Deterministic rotating pool — iterates through the full shuffled list
    before repeating. Quarantines proxies that fail MAX_PROXY_FAILURES times.
    """

    def __init__(self, proxies):
        self._all = list(proxies)
        self._quarantine = {}  # proxy_label -> failure count
        self._cycle = self._new_cycle()

    def _active(self):
        return [p for p in self._all if self._quarantine.get(proxy_label(p), 0) < MAX_PROXY_FAILURES]

    def _new_cycle(self):
        pool = self._active()
        random.shuffle(pool)
        return itertools.cycle(pool) if pool else None

    def next(self):
        """Return the next proxy, skipping quarantined ones."""
        active = self._active()
        if not active:
            return None
        # Rebuild cycle when active pool shrinks significantly
        if self._cycle is None:
            self._cycle = self._new_cycle()
        for _ in range(len(self._all) * 2):
            proxy = next(self._cycle)
            if self._quarantine.get(proxy_label(proxy), 0) < MAX_PROXY_FAILURES:
                return proxy
        return None

    def record_failure(self, proxy_obj):
        label = proxy_label(proxy_obj)
        self._quarantine[label] = self._quarantine.get(label, 0) + 1
        if self._quarantine[label] >= MAX_PROXY_FAILURES:
            print("       [~] Proxy {} quarantined after {} failures.".format(label, MAX_PROXY_FAILURES))

    def record_success(self, proxy_obj):
        label = proxy_label(proxy_obj)
        # Reset failure counter on success
        if label in self._quarantine:
            self._quarantine[label] = 0

    @property
    def active_count(self):
        return len(self._active())

    @property
    def total_count(self):
        return len(self._all)


# ── Visitor Function ──────────────────────────────────────────────────────────

def visit_url(url, proxy_obj, timeout=15, verbose=False):
    """
    Send an HTTP GET request to url through the given proxy.
    Returns (success: bool, status_code: int or None)
    """
    proxies = format_proxy(proxy_obj)
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": random.choice(ACCEPT_HEADERS),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": "max-age=0",
        "Upgrade-Insecure-Requests": "1",
    }

    try:
        resp = requests.get(url, proxies=proxies, headers=headers, timeout=timeout, allow_redirects=True)
        if verbose:
            print("       Response: {} | {} bytes".format(resp.status_code, len(resp.content)))
        return (resp.status_code < 400, resp.status_code)
    except requests.exceptions.ProxyError:
        if verbose:
            print("       Proxy error")
        return (False, None)
    except requests.exceptions.ConnectTimeout:
        if verbose:
            print("       Timeout")
        return (False, None)
    except Exception as e:
        if verbose:
            print("       Error: {}".format(e))
        return (False, None)


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="AutoVisitor — boost traffic to a URL using Webshare rotating proxies",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog="""
Examples:
  python autovisitor.py https://myblog.com
  python autovisitor.py https://myblog.com -n 50 -d 2
  python autovisitor.py https://myblog.com -n 100 -d 0.5 --mode backbone -v
  python autovisitor.py https://myblog.com --token YOUR_TOKEN_HERE
        """,
    )
    parser.add_argument("url", help="Target URL to visit")
    parser.add_argument("-n", "--count", type=int, default=10,
                        help="Number of visits to send (default: 10)")
    parser.add_argument("-d", "--delay", type=float, default=1.0,
                        help="Delay in seconds between visits (default: 1.0)")
    parser.add_argument("--mode", choices=["direct", "backbone"], default="direct",
                        help="Webshare proxy mode: 'direct' or 'backbone' (default: direct)")
    parser.add_argument("--timeout", type=int, default=15,
                        help="Request timeout in seconds (default: 15)")
    parser.add_argument("--token", default="",
                        help="Webshare API token (overrides WEBSHARE_API_TOKEN env var)")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Show detailed output per visit")
    return parser.parse_args()


def validate_args(args):
    errors = []
    if args.count < 1:
        errors.append("--count must be at least 1 (got {})".format(args.count))
    if args.delay < 0:
        errors.append("--delay cannot be negative (got {})".format(args.delay))
    if args.timeout < 1:
        errors.append("--timeout must be at least 1 second (got {})".format(args.timeout))
    if not args.url.startswith(("http://", "https://")):
        errors.append("URL must start with http:// or https:// (got '{}')".format(args.url))
    if errors:
        for e in errors:
            print("[ERROR] {}".format(e))
        sys.exit(1)


def main():
    args = parse_args()
    validate_args(args)

    # ── Resolve API token ──────────────────────────────────────────────────────
    token = args.token or os.environ.get("WEBSHARE_API_TOKEN", "")
    if not token:
        print("[ERROR] Webshare API token not found.")
        print("        Set env var WEBSHARE_API_TOKEN=<token>  or use --token <token>")
        sys.exit(1)

    print("=" * 60)
    print("  AutoVisitor")
    print("=" * 60)
    print("  Target  : {}".format(args.url))
    print("  Visits  : {}".format(args.count))
    print("  Delay   : {}s".format(args.delay))
    print("  Mode    : {}".format(args.mode))
    print("=" * 60)

    # ── Fetch full proxy list (paginated) ──────────────────────────────────────
    print("\n[*] Fetching proxy list from Webshare...")
    raw_proxies = get_proxy_list(token, mode=args.mode)
    if not raw_proxies:
        print("[ERROR] No proxies available. Check your Webshare plan or API token.")
        sys.exit(1)

    pool = ProxyPool(raw_proxies)
    print("[+] Loaded {} proxies.\n".format(pool.total_count))

    # ── Visit loop ─────────────────────────────────────────────────────────────
    success_count = 0
    failed_count = 0

    for i in range(args.count):
        # Retry up to MAX_RETRIES times per visit slot
        slot_ok = False
        for attempt in range(1, MAX_RETRIES + 1):
            proxy = pool.next()
            if proxy is None:
                print("[{}/{}] No active proxies remaining. Stopping.".format(i + 1, args.count))
                break

            label = proxy_label(proxy)
            suffix = "" if attempt == 1 else " (retry {}/{})".format(attempt, MAX_RETRIES)
            print("[{}/{}] via {}{}...".format(i + 1, args.count, label, suffix), end="")
            sys.stdout.flush()

            ok, status = visit_url(args.url, proxy, timeout=args.timeout, verbose=args.verbose)

            if ok:
                pool.record_success(proxy)
                status_str = "OK ({})".format(status) if status else "OK"
                print("  [SUCCESS] {}".format(status_str))
                slot_ok = True
                break
            else:
                pool.record_failure(proxy)
                status_str = "({})".format(status) if status else "(no response)"
                print("  [FAILED] {}".format(status_str))

        if slot_ok:
            success_count += 1
        else:
            failed_count += 1

        if i < args.count - 1 and args.delay > 0:
            time.sleep(args.delay)

    # ── Summary ────────────────────────────────────────────────────────────────
    total = success_count + failed_count
    rate = (success_count / total * 100) if total > 0 else 0
    print("\n" + "=" * 60)
    print("  DONE")
    print("=" * 60)
    print("  Total   : {}".format(total))
    print("  Success : {} ({:.1f}%)".format(success_count, rate))
    print("  Failed  : {}".format(failed_count))
    print("  Proxies : {}/{} still active".format(pool.active_count, pool.total_count))
    print("=" * 60)


if __name__ == "__main__":
    main()
