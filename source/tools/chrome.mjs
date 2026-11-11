// Browser launch options for tests and exports: CHROME_PATH, else the system Chrome on Linux/macOS,
// else Playwright's own Chromium. Software WebGL so renders work on machines without a GPU.
import { existsSync } from 'node:fs';
const CANDIDATES = ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const executablePath = process.env.CHROME_PATH || CANDIDATES.find((p) => existsSync(p));
export const launchOptions = { ...(executablePath ? { executablePath } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
