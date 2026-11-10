#!/usr/bin/env node
/**
 * Open app routes in headless Chromium at a wide and a narrow size, save a
 * screenshot of each, and report console errors and failed requests.
 *
 * Usage (from frontend/naturewatch):
 *   node scripts/browser-check.mjs --out <dir> [options] <route> [<route> ...]
 *
 * Options:
 *   --out <dir>       Where screenshots and report.json go. Required.
 *   --steps <file>    A module whose default export is
 *                     async (page, { route, viewport }) => void, run after each
 *                     route loads. Use it to click, type, or wait.
 *   --click <text>    Click the first element with this text after loading.
 *                     Repeat for several clicks, in order.
 *   --wait <ms>       Extra wait after loading and after each click. Default 1500.
 *   --full            Save full-page screenshots instead of the viewport.
 *   --base <url>      Use a server that is already running instead of starting
 *                     the dev server. Default http://localhost:5173.
 *
 * Without --base, the script reuses a server already answering on
 * http://localhost:5173, or starts `vite` on that port and stops it at the end.
 * The dev server reads .env, so the hosted Supabase project is used.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
];
const DEFAULT_BASE = 'http://localhost:5173';

/** Does nothing. Used where a step may be skipped. */
const noop = () => undefined;

/**
 * Read the command-line options.
 * @param {string[]} argv - The arguments after the script name.
 * @returns {object} The routes and options.
 */
function parseArgs(argv) {
  const options = { routes: [], clicks: [], wait: 1500, full: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') options.out = argv[++i];
    else if (arg === '--steps') options.steps = argv[++i];
    else if (arg === '--click') options.clicks.push(argv[++i]);
    else if (arg === '--wait') options.wait = Number(argv[++i]);
    else if (arg === '--full') options.full = true;
    else if (arg === '--base') options.base = argv[++i];
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else options.routes.push(arg);
  }
  if (!options.out) throw new Error('--out <dir> is required');
  if (options.routes.length === 0) options.routes.push('/');
  return options;
}

/**
 * Check whether a URL answers with a success status.
 * @param {string} url - The address to fetch.
 * @returns {Promise<boolean>} True when it answers.
 */
async function answers(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Reuse the dev server on port 5173, or start one.
 * @returns {Promise<{base: string, stop: () => void}>} Its address and how to stop it.
 */
async function startDevServer() {
  if (await answers(DEFAULT_BASE)) return { base: DEFAULT_BASE, stop: noop };
  const child = spawn(
    'npx',
    ['vite', '--host', 'localhost', '--port', '5173', '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  );
  let log = '';
  child.stdout.on('data', chunk => (log += chunk));
  child.stderr.on('data', chunk => (log += chunk));
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already stopped.
    }
  };
  for (let waited = 0; waited < 60000; waited += 500) {
    if (await answers(DEFAULT_BASE)) return { base: DEFAULT_BASE, stop };
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  stop();
  throw new Error(`the dev server did not start:\n${log}`);
}

/**
 * Turn a route into a file name.
 * @param {string} route - The app route.
 * @returns {string} A name safe for a file.
 */
function slug(route) {
  return route.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home';
}

/**
 * Check each route at each size and write the report.
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });
  const steps = options.steps
    ? (await import(pathToFileURL(path.resolve(options.steps)).href)).default
    : null;
  const server = options.base
    ? { base: options.base, stop: noop }
    : await startDevServer();
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const report = [];
  try {
    for (const route of options.routes) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        const problems = [];
        page.on('console', message => {
          if (message.type() === 'error')
            problems.push(`console: ${message.text()}`);
        });
        page.on('pageerror', error =>
          problems.push(`page error: ${error.message}`)
        );
        page.on('requestfailed', request => {
          const reason = request.failure()?.errorText ?? 'failed';
          if (reason !== 'net::ERR_ABORTED') {
            problems.push(`request failed: ${request.url()} (${reason})`);
          }
        });
        page.on('response', response => {
          if (response.status() >= 400) {
            problems.push(`HTTP ${response.status()}: ${response.url()}`);
          }
        });

        await page.goto(new URL(route, server.base).href);
        await page
          .waitForLoadState('networkidle', { timeout: 15000 })
          .catch(noop);
        await page.waitForTimeout(options.wait);
        for (const text of options.clicks) {
          await page.getByText(text, { exact: false }).first().click();
          await page.waitForTimeout(options.wait);
        }
        if (steps) await steps(page, { route, viewport: viewport.name });

        const file = path.join(
          options.out,
          `${slug(route)}-${viewport.name}.png`
        );
        await page.screenshot({ path: file, fullPage: options.full });
        report.push({
          route,
          viewport: `${viewport.name} ${viewport.width}x${viewport.height}`,
          url: page.url(),
          title: await page.title(),
          screenshot: path.resolve(file),
          problems,
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(
    path.join(options.out, 'report.json'),
    JSON.stringify(report, null, 2)
  );
  for (const entry of report) {
    console.log(`${entry.route} [${entry.viewport}] -> ${entry.screenshot}`);
    for (const problem of entry.problems) console.log(`  ${problem}`);
  }
}

main().catch(error => {
  console.error(error.message ?? error);
  process.exit(1);
});
