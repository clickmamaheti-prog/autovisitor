import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import {
  StartSessionBody,
  GetSessionStatusParams,
  StopSessionParams,
} from "@workspace/api-zod";

const router = Router();

// ── User-Agent pool ───────────────────────────────────────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type VisitLog = {
  index: number;
  proxy: string;
  success: boolean;
  statusCode: number | null;
  timestamp: string;
};

type SessionState = "pending" | "running" | "done" | "stopped" | "error";

type Session = {
  sessionId: string;
  state: SessionState;
  total: number;
  success: number;
  failed: number;
  completed: number;
  proxyCount: number | null;
  errorMessage: string | null;
  logs: VisitLog[];
  stopRequested: boolean;
};

// ── In-memory session store ───────────────────────────────────────────────────
const sessions = new Map<string, Session>();

// Clean up sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, _] of sessions) {
    // Use sessionId creation time embedded in the id — just clear old done/stopped sessions
    const s = sessions.get(id);
    if (s && (s.state === "done" || s.state === "stopped" || s.state === "error")) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ── Webshare proxy fetcher ────────────────────────────────────────────────────
async function fetchProxies(token: string, mode: string): Promise<Array<{
  proxy_address: string;
  port: number;
  username: string;
  password: string;
}>> {
  const proxies: Array<{ proxy_address: string; port: number; username: string; password: string }> = [];
  let page = 1;

  while (true) {
    const url = `https://proxy.webshare.io/api/v2/proxy/list/?mode=${mode}&page=${page}&page_size=100`;
    const resp = await fetch(url, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid Webshare API token");
      throw new Error(`Webshare API error: ${resp.status}`);
    }

    const data = (await resp.json()) as { results: typeof proxies; next: string | null };
    proxies.push(...data.results);
    if (!data.next) break;
    page++;
  }

  return proxies;
}

// ── Visit a URL through a proxy ───────────────────────────────────────────────
async function visitUrl(
  targetUrl: string,
  proxy: { proxy_address: string; port: number; username: string; password: string },
  timeoutMs = 15000,
): Promise<{ success: boolean; statusCode: number | null }> {
  const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;
  const dispatcher = new ProxyAgent(proxyUrl);
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  try {
    const resp = await undiciFetch(targetUrl, {
      dispatcher,
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { success: resp.status < 400, statusCode: resp.status };
  } catch {
    return { success: false, statusCode: null };
  }
}

// ── Background runner ─────────────────────────────────────────────────────────
async function runSession(
  session: Session,
  proxies: Array<{ proxy_address: string; port: number; username: string; password: string }>,
  targetUrl: string,
  delay: number,
) {
  session.state = "running";
  session.proxyCount = proxies.length;

  // Shuffle proxies for deterministic rotation
  const pool = [...proxies].sort(() => Math.random() - 0.5);
  const MAX_LOGS = 200;

  for (let i = 0; i < session.total; i++) {
    if (session.stopRequested) {
      session.state = "stopped";
      return;
    }

    const proxy = pool[i % pool.length];
    const proxyLabel = `${proxy.proxy_address}:${proxy.port}`;

    const { success, statusCode } = await visitUrl(targetUrl, proxy);

    if (success) session.success++;
    else session.failed++;
    session.completed++;

    const log: VisitLog = {
      index: i + 1,
      proxy: proxyLabel,
      success,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    session.logs.unshift(log);
    if (session.logs.length > MAX_LOGS) session.logs.pop();

    if (i < session.total - 1 && delay > 0) {
      await new Promise<void>((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          done = true;
          clearInterval(check);
          resolve();
        }, delay * 1000);
        const check = setInterval(() => {
          if (session.stopRequested && !done) {
            done = true;
            clearTimeout(timer);
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }
  }

  session.state = "done";
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/autovisitor/start
router.post("/autovisitor/start", async (req: Request, res: Response) => {
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token, url, count, delay = 1.0, mode = "direct" } = parsed.data;

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL format" });
    return;
  }

  const sessionId = randomUUID();
  const session: Session = {
    sessionId,
    state: "pending",
    total: count,
    success: 0,
    failed: 0,
    completed: 0,
    proxyCount: null,
    errorMessage: null,
    logs: [],
    stopRequested: false,
  };
  sessions.set(sessionId, session);

  // Fetch proxies and start visits in background
  (async () => {
    try {
      const proxies = await fetchProxies(token, mode);
      if (proxies.length === 0) {
        session.state = "error";
        session.errorMessage = "No proxies available. Check your Webshare plan.";
        return;
      }
      await runSession(session, proxies, url, delay);
    } catch (err) {
      session.state = "error";
      session.errorMessage = err instanceof Error ? err.message : "Unknown error";
    }
  })();

  res.json({ sessionId, status: "started" });
});

// GET /api/autovisitor/status/:sessionId
router.get("/autovisitor/status/:sessionId", (req: Request, res: Response) => {
  const parsed = GetSessionStatusParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const session = sessions.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { stopRequested: _, ...statusData } = session;
  res.json(statusData);
});

// POST /api/autovisitor/stop/:sessionId
router.post("/autovisitor/stop/:sessionId", (req: Request, res: Response) => {
  const parsed = StopSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const session = sessions.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  session.stopRequested = true;
  const { stopRequested: _, ...statusData } = session;
  res.json(statusData);
});

export default router;
