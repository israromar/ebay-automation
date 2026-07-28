import type { BrowserProvider, BrowserSession, BrowserSessionOptions } from "./types";

/**
 * Local Playwright browser provider.
 * Production collectors should use this (or a future Browserbase implementation),
 * not Playwright MCP.
 */
export class LocalPlaywrightBrowserProvider implements BrowserProvider {
  private sessions = new Map<string, BrowserSession>();

  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Lazy: actual playwright.chromium.launch is done by callers that need a page.
    // This abstraction records session lifecycle for future Browserbase swap.
    const session: BrowserSession = {
      id,
      close: async () => {
        this.sessions.delete(id);
      },
    };
    void options;
    this.sessions.set(id, session);
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) await s.close();
  }
}
