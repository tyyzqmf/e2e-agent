/**
 * E2E CLI - Environment Check Functions
 *
 * Functions to check required dependencies and their versions.
 */

import { $ } from "bun";
import { colors, printError, printInfo } from "./utils.ts";

// ====================================
// Dependency Check Functions
// ====================================

export async function checkPython(): Promise<boolean> {
  try {
    const result = await $`python3 -c "import sys; v=sys.version_info; exit(0 if v.major>=3 and v.minor>=7 else 1)"`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkNode(): Promise<boolean> {
  try {
    const result = await $`node --version`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkNpx(): Promise<boolean> {
  try {
    const result = await $`npx --version`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkChrome(): Promise<boolean> {
  // Check for various Chrome/Chromium installations
  const commands = [
    "google-chrome --version",
    "google-chrome-stable --version",
    "chromium --version",
    "chromium-browser --version",
  ];

  for (const cmd of commands) {
    try {
      const result = await $`${{ raw: cmd }}`.quiet().nothrow();
      if (result.exitCode === 0) {
        return true;
      }
    } catch {
      // Continue to next command
    }
  }

  // Check macOS Chrome
  try {
    const result = await $`test -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.quiet().nothrow();
    if (result.exitCode === 0) {
      return true;
    }
  } catch {
    // Not found
  }

  return false;
}

export function checkBun(): boolean {
  // We're running in Bun, so it's always available
  return true;
}

// ====================================
// Version Retrieval Functions
// ====================================

export async function getPythonVersion(): Promise<string> {
  try {
    const result = await $`python3 --version`.quiet().text();
    return result.trim().replace("Python ", "") || "Not found";
  } catch {
    return "Not found";
  }
}

export async function getNodeVersion(): Promise<string> {
  try {
    const result = await $`node --version`.quiet().text();
    return result.trim() || "Not found";
  } catch {
    return "Not found";
  }
}

export async function getNpxVersion(): Promise<string> {
  try {
    const result = await $`npx --version`.quiet().text();
    return result.trim() || "Not found";
  } catch {
    return "Not found";
  }
}

export async function getChromeVersion(): Promise<string> {
  const commands = [
    { cmd: "google-chrome --version", extract: (s: string) => s.split(" ").pop() || "Unknown" },
    { cmd: "google-chrome-stable --version", extract: (s: string) => s.split(" ").pop() || "Unknown" },
    { cmd: "chromium --version", extract: (s: string) => s.split(" ")[1] || "Unknown" },
    { cmd: "chromium-browser --version", extract: (s: string) => s.split(" ")[1] || "Unknown" },
  ];

  for (const { cmd, extract } of commands) {
    try {
      const result = await $`${{ raw: cmd }}`.quiet().nothrow();
      if (result.exitCode === 0) {
        return extract(result.stdout.toString().trim());
      }
    } catch {
      // Continue to next command
    }
  }

  return "Not found";
}

export function getBunVersion(): string {
  return Bun.version;
}

// ====================================
// Main Check Function
// ====================================

interface CheckResult {
  hasErrors: boolean;
  errors: string[];
}

export async function checkRequirements(verbose: boolean = true): Promise<CheckResult> {
  const errors: string[] = [];

  if (verbose) {
    console.log("");
    console.log("Checking environment requirements...");
    console.log("");
  }

  // Check Python
  if (verbose) {
    process.stdout.write("  Python 3.7+:    ");
  }
  if (await checkPython()) {
    if (verbose) {
      const version = await getPythonVersion();
      console.log(`${colors.green}OK${colors.reset} (${version})`);
    }
  } else {
    if (verbose) {
      console.log(`${colors.red}MISSING${colors.reset}`);
    }
    errors.push("Python 3.7+");
  }

  // Check Node.js
  if (verbose) {
    process.stdout.write("  Node.js:        ");
  }
  if (await checkNode()) {
    if (verbose) {
      const version = await getNodeVersion();
      console.log(`${colors.green}OK${colors.reset} (${version})`);
    }
  } else {
    if (verbose) {
      console.log(`${colors.red}MISSING${colors.reset}`);
    }
    errors.push("Node.js");
  }

  // Check npx
  if (verbose) {
    process.stdout.write("  npx:            ");
  }
  if (await checkNpx()) {
    if (verbose) {
      const version = await getNpxVersion();
      console.log(`${colors.green}OK${colors.reset} (${version})`);
    }
  } else {
    if (verbose) {
      console.log(`${colors.red}MISSING${colors.reset}`);
    }
    errors.push("npx");
  }

  // Check Chrome
  if (verbose) {
    process.stdout.write("  Chrome/Chromium:");
  }
  if (await checkChrome()) {
    if (verbose) {
      const version = await getChromeVersion();
      console.log(`${colors.green}OK${colors.reset} (${version})`);
    }
  } else {
    if (verbose) {
      console.log(`${colors.red}MISSING${colors.reset}`);
    }
    errors.push("Chrome/Chromium");
  }

  // Check Bun (always present)
  if (verbose) {
    process.stdout.write("  Bun:            ");
    console.log(`${colors.green}OK${colors.reset} (${getBunVersion()})`);
    console.log("");
  }

  return {
    hasErrors: errors.length > 0,
    errors,
  };
}

/**
 * Check requirements and exit if missing
 */
export async function checkRequirementsOrExit(verbose: boolean = true): Promise<void> {
  const result = await checkRequirements(verbose);

  if (result.hasErrors) {
    if (verbose) {
      printError("Missing required dependencies!");
      console.log("");
      console.log("Please install the missing components:");
      console.log("");

      if (result.errors.includes("Python 3.7+")) {
        console.log("  Python 3.7+:");
        console.log("    Ubuntu/Debian: sudo apt install python3 python3-venv");
        console.log("    macOS: brew install python3");
        console.log("");
      }

      if (result.errors.includes("Node.js") || result.errors.includes("npx")) {
        console.log("  Node.js & npx:");
        console.log("    Ubuntu/Debian: sudo apt install nodejs npm");
        console.log("    macOS: brew install node");
        console.log("");
      }

      if (result.errors.includes("Chrome/Chromium")) {
        console.log("  Chrome/Chromium:");
        console.log("    Ubuntu/Debian: sudo apt install chromium-browser");
        console.log("    macOS: brew install --cask google-chrome");
        console.log("");
      }
    } else {
      printError(`Missing dependencies: ${result.errors.join(", ")}`);
      console.log("Run 'e2e check' for details");
    }

    process.exit(1);
  }
}

// ====================================
// Environment Setup
// ====================================

export async function setupEnvironment(verbose: boolean = true): Promise<void> {
  // Check requirements
  await checkRequirementsOrExit(verbose);

  // Create virtual environment if needed
  const venvPath = `${process.cwd()}/.venv`;
  const venvExists = await Bun.file(venvPath).exists();

  if (!venvExists) {
    if (verbose) {
      printInfo("Creating Python virtual environment...");
    }
    await $`python3 -m venv .venv`.quiet();
  }

  // Install dependencies silently
  try {
    await $`source .venv/bin/activate && pip install -q -r src/agent/requirements.txt`.quiet().nothrow();
  } catch {
    // Ignore errors
  }

  // Create directories
  await $`mkdir -p data/reports logs`.quiet();

  // Set AWS Bedrock environment variables
  process.env.USE_AWS_BEDROCK = process.env.USE_AWS_BEDROCK ?? "true";
  process.env.AWS_REGION = process.env.AWS_REGION ?? "us-west-2";

  if (process.env.USE_AWS_BEDROCK === "true") {
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";
  }
}
