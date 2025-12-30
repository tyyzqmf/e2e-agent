/**
 * MCP Servers Configuration
 * ==========================
 *
 * Configuration for Model Context Protocol (MCP) servers used by Claude.
 */

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Default Chrome executable path
 */
export const CHROME_EXECUTABLE_PATH = "/usr/bin/google-chrome";

/**
 * Default Chrome arguments for headless operation in containerized environments
 */
export const DEFAULT_CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
] as const;

/**
 * Options for Chrome DevTools MCP configuration
 */
export interface ChromeDevtoolsOptions {
  /** Whether to run Chrome in headless mode (default: true) */
  headless?: boolean;
  /** Path to Chrome/Chromium executable */
  executablePath?: string;
  /** Whether to run in isolated mode (default: true) */
  isolated?: boolean;
  /** Additional Chrome arguments */
  extraChromeArgs?: string[];
}

/**
 * Get Chrome DevTools MCP server configuration
 *
 * @param options - Configuration options
 * @returns MCP server configuration dictionary
 */
export function getChromeDevtoolsConfig(
  options: ChromeDevtoolsOptions = {}
): McpServerConfig {
  const {
    headless = true,
    executablePath = CHROME_EXECUTABLE_PATH,
    isolated = true,
    extraChromeArgs = [],
  } = options;

  const args: string[] = ["-y", "chrome-devtools-mcp@latest"];

  if (headless) {
    args.push("--headless");
  }

  args.push(`--executablePath=${executablePath}`);

  if (isolated) {
    args.push("--isolated=true");
  }

  // Add default Chrome args
  for (const chromeArg of DEFAULT_CHROME_ARGS) {
    args.push(`--chromeArg=${chromeArg}`);
  }

  // Add extra Chrome args if provided
  for (const chromeArg of extraChromeArgs) {
    args.push(`--chromeArg=${chromeArg}`);
  }

  return {
    command: "npx",
    args,
  };
}

/**
 * Get default MCP server configurations
 *
 * @param options - Configuration options
 * @returns Dictionary of MCP server configurations
 */
export function getDefaultMcpServers(
  options: {
    includeChromeDevtools?: boolean;
    chromeConfig?: McpServerConfig;
  } = {}
): Record<string, McpServerConfig> {
  const { includeChromeDevtools = true, chromeConfig } = options;

  const servers: Record<string, McpServerConfig> = {};

  if (includeChromeDevtools) {
    servers["chrome-devtools"] = chromeConfig ?? getChromeDevtoolsConfig();
  }

  return servers;
}

/**
 * Create a custom MCP server configuration
 *
 * @param command - The command to run the MCP server
 * @param args - Optional list of arguments
 * @param env - Optional environment variables
 * @returns MCP server configuration dictionary
 */
export function createCustomMcpServer(
  command: string,
  args?: string[],
  env?: Record<string, string>
): McpServerConfig {
  const config: McpServerConfig = { command, args: args ?? [] };

  if (env) {
    config.env = env;
  }

  return config;
}
