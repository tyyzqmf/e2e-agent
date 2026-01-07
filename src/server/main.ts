/**
 * E2E Agent Web Service - Main Module
 *
 * Exports startServer function for use in compiled binary mode.
 * This module contains the same logic as index.ts but is designed
 * to be imported rather than run directly.
 */

import { config, validateConfig } from "./config.ts";
import {
	buildApiRoutes,
	buildHealthRoute,
	handleOptions,
} from "./routes/api.ts";
import { buildStaticRoutes, notFoundHandler } from "./routes/static.ts";
import { JobManager } from "./services/JobManager.ts";
import { ResultService } from "./services/ResultService.ts";
import type { ServiceContext } from "./types/index.ts";
import { logger } from "./utils/logger.ts";

/**
 * Initialize services
 */
function initializeServices(): ServiceContext {
	logger.info("Initializing services...");

	const jobManager = new JobManager();
	const resultService = new ResultService();

	logger.info("Services initialized successfully");

	return { jobManager, resultService };
}

/**
 * Build route handlers
 */
function buildRoutes(
	services: ServiceContext,
	// biome-ignore lint/suspicious/noExplicitAny: Routes accept both Request and BunRequest types
): Record<string, (req: any) => Response | Promise<Response>> {
	return {
		...buildHealthRoute(services),
		...buildApiRoutes(services),
		...buildStaticRoutes(),
	};
}

/**
 * Create request handler with middleware
 */
function createRequestHandler(
	// biome-ignore lint/suspicious/noExplicitAny: Routes accept both Request and BunRequest types
	routes: Record<string, (req: any) => Response | Promise<Response>>,
) {
	return async (req: Request): Promise<Response> => {
		const startTime = performance.now();
		const url = new URL(req.url);
		const method = req.method;
		const path = url.pathname;

		if (method === "OPTIONS") {
			return handleOptions();
		}

		try {
			const routeKey = `${method} ${path}`;
			const handler = routes[routeKey];

			let response: Response;

			if (handler) {
				response = await handler(req);
			} else {
				response = await matchParameterizedRoute(req, routes);
			}

			const duration = Math.round(performance.now() - startTime);
			logger.request(method, path, response.status, duration);

			return response;
		} catch (error) {
			const duration = Math.round(performance.now() - startTime);
			logger.error(`Request error: ${method} ${path}`, error);
			logger.request(method, path, 500, duration);

			return new Response(
				JSON.stringify({
					success: false,
					error: "Internal Server Error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}

/**
 * Match parameterized routes
 */
async function matchParameterizedRoute(
	req: Request,
	routes: Record<string, (req: Request) => Response | Promise<Response>>,
): Promise<Response> {
	const url = new URL(req.url);
	const method = req.method;
	const pathParts = url.pathname.split("/").filter(Boolean);

	const patterns = [
		{ pattern: "GET /api/jobs/:id", parts: ["api", "jobs", ":id"] },
		{
			pattern: "GET /api/jobs/:id/logs",
			parts: ["api", "jobs", ":id", "logs"],
		},
		{
			pattern: "GET /api/jobs/:id/report",
			parts: ["api", "jobs", ":id", "report"],
		},
		{
			pattern: "GET /api/jobs/:id/download",
			parts: ["api", "jobs", ":id", "download"],
		},
		{
			pattern: "GET /api/jobs/:id/screenshots/:filename",
			parts: ["api", "jobs", ":id", "screenshots", ":filename"],
		},
		{
			pattern: "POST /api/jobs/:id/stop",
			parts: ["api", "jobs", ":id", "stop"],
		},
		{ pattern: "DELETE /api/jobs/:id", parts: ["api", "jobs", ":id"] },
		{ pattern: "GET /status/:id", parts: ["status", ":id"] },
		{ pattern: "GET /static/*", parts: ["static"] },
	];

	for (const { pattern, parts } of patterns) {
		const [patternMethod] = pattern.split(" ");
		if (patternMethod !== method) continue;

		if (parts[0] === "static" && pathParts[0] === "static") {
			const handler = routes["GET /static/*"];
			if (handler) return handler(req);
		}

		if (pathParts.length === parts.length) {
			let matches = true;
			const params: Record<string, string> = {};

			for (let i = 0; i < parts.length; i++) {
				if (parts[i].startsWith(":")) {
					params[parts[i].slice(1)] = pathParts[i];
				} else if (parts[i] !== pathParts[i]) {
					matches = false;
					break;
				}
			}

			if (matches) {
				const enhancedReq = Object.assign(req, { params });
				const handler = routes[pattern];
				if (handler) return handler(enhancedReq);
			}
		}
	}

	return notFoundHandler();
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(jobManager: JobManager): void {
	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, initiating graceful shutdown...`);
		jobManager.close();
		logger.info("Shutdown complete");
		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Start the web server
 * This is the main entry point for compiled binary mode.
 */
export async function startServer(): Promise<void> {
	// Validate configuration
	const configErrors = validateConfig();
	if (configErrors.length > 0) {
		logger.error("Configuration errors:", configErrors);
		process.exit(1);
	}

	// Print startup banner
	console.log(`
╔═══════════════════════════════════════════════════════════╗
║           E2E Test Agent Web Service v2.0.0               ║
║               Powered by Bun ${Bun.version.padEnd(26)}   ║
╚═══════════════════════════════════════════════════════════╝
  `);

	// Initialize services
	const services = initializeServices();

	// Setup shutdown handlers
	setupShutdownHandlers(services.jobManager);

	// Build routes
	const routes = buildRoutes(services);

	// Create request handler
	const fetch = createRequestHandler(routes);

	// Start HTTP server
	const server = Bun.serve({
		port: config.PORT,
		hostname: config.HOST,
		fetch,
		error(error: Error) {
			logger.error("Server error", error);
			return new Response(
				JSON.stringify({
					success: false,
					error: "Internal Server Error",
					code: "SERVER_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		},
	});

	logger.info(`Server listening on http://${server.hostname}:${server.port}`);
	logger.info(`Environment: ${config.NODE_ENV}`);
	logger.info(`Log level: ${config.LOG_LEVEL}`);
	logger.info(`Data directory: ${config.DATA_DIR}`);
	logger.info(`Note: Executor runs independently via 'e2e start executor'`);
	logger.info("Service is ready to accept requests");

	// Keep process running indefinitely
	await new Promise(() => {});
}
