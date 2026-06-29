# config.example.py
# Copy to config.py and fill in your values.
# Or just use environment variables / CLI flags.

# Webshare API token — get it from https://proxy.webshare.io/userapi/keys
WEBSHARE_API_TOKEN = "YOUR_WEBSHARE_TOKEN_HERE"

# Default visit settings
DEFAULT_COUNT   = 20       # Number of visits per run
DEFAULT_DELAY   = 1.5      # Seconds between visits
DEFAULT_MODE    = "direct" # "direct" or "backbone"
DEFAULT_TIMEOUT = 15       # Request timeout in seconds
