/**
 * Local HTTPS server for Plaid Link browser-based OAuth flow.
 * Used in production to link real bank accounts (e.g., Bank of America).
 *
 * Plaid production OAuth requires HTTPS redirect URIs. This server
 * auto-generates a self-signed certificate for localhost so no
 * external tools (ngrok, mkcert) are needed.
 *
 * Flow:
 * 1. Generates a self-signed TLS certificate for localhost
 * 2. Creates a Link token via Plaid API (with https:// redirect_uri)
 * 3. Starts a local HTTPS server serving the Plaid Link JS SDK
 * 4. User authenticates with their bank in the browser
 * 5. Plaid Link returns a public_token via callback
 * 6. Server exchanges public_token for access_token
 * 7. Server shuts down and returns the result
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import { type IncomingMessage, type ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { URL } from 'url';
import selfsigned from 'selfsigned';
import { Products } from 'plaid';
import { createLinkToken, exchangePublicToken, getItem } from './link.js';
import { getAccounts } from './transactions.js';
import { getPlaidConfig } from './client.js';
import type { PlaidAccount } from '@findata/types';

export interface LinkServerOptions {
  /** User ID for Plaid Link */
  userId: string;
  /** Port for the local server (default: 8484) */
  port?: number;
  /** Products to request (default: [Transactions]) */
  products?: Products[];
  /** Institution ID to pre-select (e.g., 'ins_4' for Bank of America) */
  institutionId?: string | undefined;
  /** Timeout in ms before auto-shutdown (default: 300000 = 5 min) */
  timeout?: number;
}

export interface LinkServerResult {
  accessToken: string;
  itemId: string;
  institutionId: string | null;
  accounts: PlaidAccount[];
  requestId: string;
}

/**
 * Generate or load a self-signed TLS certificate for localhost.
 * Certs are cached in .plaid-certs/ to avoid regenerating each run.
 * Uses the `selfsigned` npm package (pure JS, no openssl dependency).
 */
async function getSelfSignedCert(): Promise<{ key: string; cert: string }> {
  const certDir = join(process.cwd(), '.plaid-certs');
  const keyPath = join(certDir, 'localhost-key.pem');
  const certPath = join(certDir, 'localhost-cert.pem');

  if (existsSync(keyPath) && existsSync(certPath)) {
    return {
      key: readFileSync(keyPath, 'utf-8'),
      cert: readFileSync(certPath, 'utf-8'),
    };
  }

  console.error('[INFO] Generating self-signed TLS certificate for localhost...');
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true });
  }

  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate,
    extensions: [
      { name: 'subjectAltName', altNames: [
        { type: 2, value: 'localhost' },       // DNS
        { type: 7, ip: '127.0.0.1' },          // IP
      ]},
    ],
  });

  writeFileSync(keyPath, pems.private);
  writeFileSync(certPath, pems.cert);

  console.error('[INFO] Self-signed certificate generated at .plaid-certs/');

  // Add .plaid-certs to .gitignore if not already present
  const gitignorePath = join(process.cwd(), '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.plaid-certs')) {
      writeFileSync(gitignorePath, gitignore.trimEnd() + '\n.plaid-certs/\n');
    }
  }

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

/**
 * Start a local HTTPS Plaid Link server for production OAuth flow.
 * Opens a browser page where the user authenticates with their bank.
 * Returns a promise that resolves with the linked item details.
 */
export async function startLinkServer(
  options: LinkServerOptions
): Promise<LinkServerResult> {
  const port = options.port ?? 8484;
  const timeout = options.timeout ?? 300000;
  const products = options.products ?? [Products.Transactions];
  const config = getPlaidConfig();

  // Production requires HTTPS redirect URIs
  const redirectUri = config.redirectUri ?? `https://localhost:${port}/oauth-callback`;

  // Generate or load self-signed TLS cert
  const tlsCert = await getSelfSignedCert();

  // Create link token
  console.error('[INFO] Creating Plaid Link token...');
  const linkTokenResult = await createLinkToken({
    userId: options.userId,
    products,
    redirectUri,
  });
  console.error(`[INFO] Link token created (expires: ${linkTokenResult.expiration})`);

  return new Promise<LinkServerResult>((resolve, reject) => {
    const shutdown = (): void => {
      clearTimeout(timeoutHandle);
      server.close();
    };

    const requestHandler = (req: IncomingMessage, res: ServerResponse): void => {
      const url = new URL(req.url ?? '/', `https://localhost:${port}`);
      const pathname = url.pathname;

      // CORS headers for local development
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Main page - serves Plaid Link
      if (pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getLinkHtml(linkTokenResult.linkToken, port, options.institutionId));
        return;
      }

      // OAuth callback page - handles redirect after bank OAuth
      if (pathname === '/oauth-callback' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getOAuthCallbackHtml(linkTokenResult.linkToken, port));
        return;
      }

      // Exchange endpoint - receives public_token from Plaid Link
      if (pathname === '/exchange' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          void (async (): Promise<void> => {
            try {
              const { public_token, metadata } = JSON.parse(body) as {
                public_token: string;
                metadata?: {
                  institution?: { institution_id?: string; name?: string };
                };
              };

              console.error('[INFO] Received public token, exchanging...');
              const exchangeResult = await exchangePublicToken(public_token);
              console.error(`[SUCCESS] Item linked: ${exchangeResult.itemId}`);

              // Get item details
              const itemInfo = await getItem(exchangeResult.accessToken);
              const institutionId = metadata?.institution?.institution_id ?? itemInfo.institutionId;

              // Get accounts
              const accounts = await getAccounts(exchangeResult.accessToken);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, itemId: exchangeResult.itemId }));

              // Resolve the promise and shut down
              shutdown();
              resolve({
                accessToken: exchangeResult.accessToken,
                itemId: exchangeResult.itemId,
                institutionId,
                accounts,
                requestId: exchangeResult.requestId,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[ERROR] Exchange failed: ${message}`);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: message }));
            }
          })();
        });
        return;
      }

      // Error endpoint - receives errors from Plaid Link onExit and onEvent
      if (pathname === '/error' && req.method === 'POST') {
        const isFatal = url.searchParams.get('fatal') === '1';
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const errorData = JSON.parse(body) as { error?: { error_message?: string; error_code?: string; error_type?: string; institution_id?: string } };
          const code = errorData.error?.error_code ?? 'unknown';
          const message = errorData.error?.error_message ?? 'Unknown Plaid Link error';
          console.error(`[ERROR] Plaid Link error: [${errorData.error?.error_type ?? ''}/${code}] ${message}`);
          if (errorData.error?.institution_id) {
            console.error(`[ERROR]   Institution: ${errorData.error.institution_id}`);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true }));
          if (isFatal) {
            shutdown();
            reject(new Error(`Plaid Link error: ${message} (${code})`));
          }
        });
        return;
      }

      // Exit endpoint - user closed Link without completing
      if (pathname === '/exit' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ acknowledged: true }));
        shutdown();
        reject(new Error('User closed Plaid Link without completing authentication'));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    };

    const server = createHttpsServer({ key: tlsCert.key, cert: tlsCert.cert }, requestHandler);

    server.listen(port, () => {
      console.error('');
      console.error('=== Plaid Link Server (HTTPS) ===');
      console.error(`Environment: ${config.env}`);
      console.error(`Server running at: https://localhost:${port}`);
      console.error('');
      console.error('Open this URL in your browser to link your bank account:');
      console.error(`  https://localhost:${port}`);
      console.error('');
      console.error('NOTE: Your browser may warn about the self-signed certificate.');
      console.error('      Click "Advanced" → "Proceed to localhost" to continue.');
      console.error('');
      console.error(`Timeout: ${timeout / 1000}s — server will auto-shutdown if not completed.`);
      console.error('Press Ctrl+C to cancel.');
      console.error('=================================');
      console.error('');
    });

    server.on('error', (err: Error) => {
      reject(new Error(`Link server failed to start: ${err.message}`));
    });

    // Auto-shutdown timeout
    const timeoutHandle = setTimeout(() => {
      console.error('[WARN] Link server timed out. Shutting down.');
      server.close();
      reject(new Error('Plaid Link server timed out'));
    }, timeout);
  });
}

/**
 * Generate the main HTML page with Plaid Link JS SDK.
 */
function getLinkHtml(linkToken: string, port: number, institutionId?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOA Statement Parser — Link Bank Account</title>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #fff;
    }
    .subtitle {
      color: #888;
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    .env-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #1a3a1a;
      color: #4ade80;
      border: 1px solid #166534;
      margin-bottom: 1.5rem;
    }
    button {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 0.8rem 2rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
    }
    .status {
      margin-top: 1.5rem;
      font-size: 0.85rem;
      color: #888;
    }
    .status.success { color: #4ade80; }
    .status.error { color: #f87171; }
    .info {
      margin-top: 2rem;
      padding: 1rem;
      background: #111;
      border-radius: 8px;
      border: 1px solid #222;
      font-size: 0.8rem;
      color: #666;
      text-align: left;
    }
    .info code {
      background: #1a1a1a;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Link Bank Account</h1>
    <p class="subtitle">BOA Statement Parser — Plaid Integration</p>
    <div class="env-badge">Production</div>
    <br>
    <button id="link-btn" onclick="openLink()">Connect Bank Account</button>
    <div id="status" class="status"></div>
    <div class="info">
      <p>This will open Plaid Link to securely connect your bank account.</p>
      <p style="margin-top: 0.5rem;">Your credentials are sent directly to your bank — they are never shared with this application.</p>
      <p style="margin-top: 0.5rem;">After linking, this page will close automatically and the CLI will continue.</p>
    </div>
  </div>
  <script>
    const linkToken = '${linkToken}';
    const serverPort = ${port};
    const statusEl = document.getElementById('status');
    const btnEl = document.getElementById('link-btn');

    function openLink() {
      btnEl.disabled = true;
      statusEl.textContent = 'Opening Plaid Link...';
      statusEl.className = 'status';

      const handler = Plaid.create({
        token: linkToken,
        onSuccess: async function(public_token, metadata) {
          statusEl.textContent = 'Exchanging token...';
          try {
            const resp = await fetch('https://localhost:' + serverPort + '/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_token, metadata }),
            });
            const data = await resp.json();
            if (data.success) {
              statusEl.textContent = 'Bank account linked successfully! You can close this tab.';
              statusEl.className = 'status success';
              btnEl.textContent = 'Done';
            } else {
              statusEl.textContent = 'Error: ' + (data.error || 'Exchange failed');
              statusEl.className = 'status error';
              btnEl.disabled = false;
            }
          } catch (err) {
            statusEl.textContent = 'Error: ' + err.message;
            statusEl.className = 'status error';
            btnEl.disabled = false;
          }
        },
        onExit: async function(err, metadata) {
          if (err) {
            await fetch('https://localhost:' + serverPort + '/error?fatal=1', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: err }),
            });
            statusEl.textContent = 'Error: ' + (err.error_message || 'Link exited with error');
            statusEl.className = 'status error';
          } else {
            await fetch('https://localhost:' + serverPort + '/exit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metadata }),
            });
            statusEl.textContent = 'Link closed without completing.';
            statusEl.className = 'status';
          }
          btnEl.disabled = false;
        },
        onEvent: function(eventName, metadata) {
          console.log('Plaid Link event:', eventName, metadata);
          if (eventName === 'ERROR' || metadata.error_code) {
            statusEl.textContent = 'Error: ' + (metadata.error_message || metadata.error_code || eventName);
            statusEl.className = 'status error';
            fetch('https://localhost:' + serverPort + '/error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: { error_message: metadata.error_message, error_code: metadata.error_code, error_type: metadata.error_type, institution_id: metadata.institution_id } }),
            });
          }
        },
      });

      handler.open(${institutionId ? `{ institution: '${institutionId}' }` : ''});
    }

    // Auto-open Plaid Link on page load
    window.addEventListener('load', function() {
      setTimeout(openLink, 500);
    });
  </script>
</body>
</html>`;
}

/**
 * Generate the OAuth callback HTML page.
 * This page is loaded after the user completes OAuth with their bank.
 * It re-initializes Plaid Link to complete the flow.
 */
function getOAuthCallbackHtml(linkToken: string, port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOA Statement Parser — OAuth Callback</title>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff; }
    .status { margin-top: 1rem; font-size: 0.9rem; color: #888; }
    .status.success { color: #4ade80; }
    .status.error { color: #f87171; }
    .spinner {
      display: inline-block;
      width: 24px; height: 24px;
      border: 3px solid #333;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Completing Bank Connection...</h1>
    <div id="status" class="status">Finishing OAuth authentication...</div>
  </div>
  <script>
    const linkToken = '${linkToken}';
    const serverPort = ${port};
    const statusEl = document.getElementById('status');

    const handler = Plaid.create({
      token: linkToken,
      receivedRedirectUri: window.location.href,
      onSuccess: async function(public_token, metadata) {
        statusEl.textContent = 'Exchanging token...';
        try {
          const resp = await fetch('https://localhost:' + serverPort + '/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token, metadata }),
          });
          const data = await resp.json();
          if (data.success) {
            statusEl.textContent = 'Bank account linked successfully! You can close this tab.';
            statusEl.className = 'status success';
          } else {
            statusEl.textContent = 'Error: ' + (data.error || 'Exchange failed');
            statusEl.className = 'status error';
          }
        } catch (err) {
          statusEl.textContent = 'Error: ' + err.message;
          statusEl.className = 'status error';
        }
      },
      onExit: async function(err) {
        if (err) {
          statusEl.textContent = 'Error: ' + (err.error_message || 'OAuth failed');
          statusEl.className = 'status error';
          await fetch('https://localhost:' + serverPort + '/error?fatal=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err }),
          });
        } else {
          statusEl.textContent = 'Authentication was cancelled.';
          await fetch('https://localhost:' + serverPort + '/exit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        }
      },
    });

    handler.open();
  </script>
</body>
</html>`;
}
