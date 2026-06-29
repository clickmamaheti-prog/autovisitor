# AutoVisitor

Boost website/blog traffic using [Webshare](https://webshare.io/) rotating proxies.  
Each visit is sent from a different IP with a randomised browser User-Agent, making traffic look organic.

---

## Features

- Fetches fresh proxy list automatically from Webshare API
- Rotates proxies randomly on every visit
- Randomises User-Agent headers per request
- Configurable visit count, delay, proxy mode, and timeout
- Clean progress output with success/fail stats
- Works with both **direct** and **backbone** Webshare proxy modes

---

## Requirements

- Python 3.6+
- A [Webshare](https://proxy.webshare.io/) account with proxies
- Your Webshare API token

---

## Installation

```bash
git clone https://github.com/clickmamaheti-prog/autovisitor.git
cd autovisitor
pip install -r requirements.txt
```

---

## Setup

Set your Webshare API token as an environment variable:

```bash
# Linux / macOS
export WEBSHARE_API_TOKEN="your_token_here"

# Windows
set WEBSHARE_API_TOKEN=your_token_here
```

Or pass it directly with `--token`.

---

## Usage

```bash
# Basic — 10 visits with 1 second delay
python autovisitor.py https://myblog.com

# 50 visits, 2 second delay
python autovisitor.py https://myblog.com -n 50 -d 2

# 100 visits, fast (0.5s delay), backbone mode, verbose output
python autovisitor.py https://myblog.com -n 100 -d 0.5 --mode backbone -v

# Pass token directly
python autovisitor.py https://myblog.com --token YOUR_TOKEN_HERE
```

### All options

```
positional arguments:
  url                   Target URL to visit

optional arguments:
  -h, --help            Show this help message and exit
  -n, --count INT       Number of visits (default: 10)
  -d, --delay FLOAT     Delay in seconds between visits (default: 1.0)
  --mode {direct,backbone}
                        Webshare proxy mode (default: direct)
  --timeout INT         Request timeout in seconds (default: 15)
  --token TOKEN         Webshare API token (overrides env var)
  -v, --verbose         Show detailed response info per visit
```

---

## How it works

1. **Fetch proxies** — calls `GET /api/v2/proxy/list/` on the Webshare API with your token
2. **Random rotation** — picks a random proxy from the list for each visit
3. **Browser simulation** — sets a random User-Agent and realistic Accept headers
4. **Request** — sends an HTTP GET through the selected proxy
5. **Report** — prints success/fail per visit and a final summary

---

## Getting your Webshare API token

1. Go to [proxy.webshare.io](https://proxy.webshare.io)
2. Navigate to **API Keys**
3. Click **Create API Key**
4. Copy the token and set it as `WEBSHARE_API_TOKEN`

---

## Notes

- Using auto-visitor tools may violate the Terms of Service of some platforms. Use responsibly.
- `direct` mode uses individual IP proxies. `backbone` mode routes through Webshare's backbone network.
- If many proxies fail, try switching `--mode` from `direct` to `backbone`.

---

## License

MIT
