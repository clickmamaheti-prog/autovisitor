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


# ── Webshare Functions ────────────────────────────────────────────────────────

def get_proxy_list(token, mode="direct", page_size=100):
    """
    Fetch proxy list from Webshare API.
    mode: 'direct' or 'backbone'
    """
    headers = {"Authorization": "Token {}".format(token)}
    params = {"mode": mode, "page": 1, "page_size": page_size}
    try:
        resp = requests.get(
            "{}/proxy/list/".format(WEBSHARE_API_BASE),
            headers=headers,
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 401:
            print("[ERROR] Invalid Webshare API token. Check WEBSHARE_API_TOKEN.")
        else:
            print("[ERROR] Failed to fetch proxies: {}".format(e))
        return []
    except Exception as e:
        print("[ERROR] Could not connect to Webshare API: {}".format(e))
        return []


def format_proxy(proxy_obj):
    """Convert Webshare proxy object to requests-compatible dict."""
    username = proxy_obj.get("username", "")
    password = proxy_obj.get("password", "")
    host = proxy_obj.get("proxy_address", "")
    port = proxy_obj.get("port", 80)
    proxy_url = "http://{}:{}@{}:{}".format(username, password, host, port)
    return {"http": proxy_url, "https": proxy_url}


# ── Visitor Function ──────────────────────────────────────────────────────────

def visit_url(url, proxy_obj, timeout=15, verbose=False):
    """
    Send an HTTP GET request to url through the given proxy.
    Returns (success: bool, status_code: int or None, proxy_addr: str)
    """
    proxy_addr = "{}:{}".format(proxy_obj.get("proxy_address", ""), proxy_obj.get("port", ""))
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
        return (resp.status_code < 400, resp.status_code, proxy_addr)
    except requests.exceptions.ProxyError:
        if verbose:
            print("       Proxy error (skipping)")
        return (False, None, proxy_addr)
    except requests.exceptions.ConnectTimeout:
        if verbose:
            print("       Timeout (skipping)")
        return (False, None, proxy_addr)
    except Exception as e:
        if verbose:
            print("       Error: {}".format(e))
        return (False, None, proxy_addr)


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


def main():
    args = parse_args()

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

    # ── Fetch proxies ──────────────────────────────────────────────────────────
    print("\n[*] Fetching proxy list from Webshare...")
    proxies = get_proxy_list(token, mode=args.mode)
    if not proxies:
        print("[ERROR] No proxies available. Check your Webshare plan or API token.")
        sys.exit(1)
    print("[+] Loaded {} proxies.\n".format(len(proxies)))

    # ── Visit loop ─────────────────────────────────────────────────────────────
    success_count = 0
    failed_count = 0

    for i in range(args.count):
        proxy = random.choice(proxies)
        proxy_addr = "{}:{}".format(proxy.get("proxy_address", ""), proxy.get("port", ""))

        print("[{}/{}] Visiting via {} ...".format(i + 1, args.count, proxy_addr), end="")
        sys.stdout.flush()

        ok, status, _ = visit_url(args.url, proxy, timeout=args.timeout, verbose=args.verbose)

        if ok:
            success_count += 1
            status_str = "OK ({})".format(status) if status else "OK"
            print("  [SUCCESS] {}".format(status_str))
        else:
            failed_count += 1
            status_str = "({})".format(status) if status else "(no response)"
            print("  [FAILED] {}".format(status_str))

        if i < args.count - 1:
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
    print("=" * 60)


if __name__ == "__main__":
    main()
