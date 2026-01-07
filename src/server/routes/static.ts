/**
 * E2E Agent Web Service - Static File Routes
 *
 * Serves static files and HTML templates.
 * Templates are embedded for compiled binary support.
 */

import { join } from "node:path";
import { config } from "../config.ts";
// Embed templates at compile time for single-binary support
import indexHtml from "../templates/index.html" with { type: "text" };
import jobsHtml from "../templates/jobs.html" with { type: "text" };
import statusHtml from "../templates/status.html" with { type: "text" };
import type { RequestWithParams } from "../types/index.ts";
import { logger } from "../utils/logger.ts";

/**
 * Embedded templates map
 */
const EMBEDDED_TEMPLATES: Record<string, string> = {
	"index.html": indexHtml,
	"status.html": statusHtml,
	"jobs.html": jobsHtml,
};

/**
 * MIME types for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".txt": "text/plain; charset=utf-8",
};

/**
 * Get MIME type from file extension
 */
function getMimeType(path: string): string {
	const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Base directory for static files (only used in development)
 */
const STATIC_DIR = join(config.PROJECT_ROOT, "src", "server", "static");

/**
 * UUID v4 regex pattern for validation
 */
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 */
function isValidUUID(id: string): boolean {
	return UUID_REGEX.test(id);
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * Build static file routes
 */
export function buildStaticRoutes() {
	return {
		/**
		 * GET / - Home page (job submission form)
		 */
		"GET /": async () => {
			return serveTemplate("index.html");
		},

		/**
		 * GET /status/:id - Job status page
		 */
		"GET /status/:id": async (req: Request) => {
			// Extract job_id from the request params
			const params = (req as RequestWithParams).params || {};
			const jobId = params.id || "";

			// Validate UUID format to prevent XSS attacks
			if (!isValidUUID(jobId)) {
				return new Response("Invalid job ID format", {
					status: 400,
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			}

			return serveTemplate("status.html", { job_id: jobId });
		},

		/**
		 * GET /jobs - Job list page
		 */
		"GET /jobs": async () => {
			return serveTemplate("jobs.html");
		},

		/**
		 * GET /static/* - Static files (CSS, JS, images)
		 */
		"GET /static/*": async (req: Request) => {
			const url = new URL(req.url);
			const filePath = url.pathname.replace("/static/", "");
			return serveStatic(filePath);
		},
	};
}

/**
 * Serve a template file with optional variable substitution
 * Uses embedded templates for compiled binary support
 */
async function serveTemplate(
	templateName: string,
	variables?: Record<string, string>,
): Promise<Response> {
	// Use embedded template
	const embeddedContent = EMBEDDED_TEMPLATES[templateName];

	if (!embeddedContent) {
		logger.warn(`Template not found: ${templateName}`);
		return new Response("Not Found", { status: 404 });
	}

	let content = embeddedContent;

	// If variables are provided, process the template
	if (variables && Object.keys(variables).length > 0) {
		// Replace {{ variable }} patterns with HTML-escaped values to prevent XSS
		for (const [key, value] of Object.entries(variables)) {
			const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
			content = content.replace(pattern, escapeHtml(value));
		}
	}

	return new Response(content, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
		},
	});
}

/**
 * Serve a static file
 */
async function serveStatic(filePath: string): Promise<Response> {
	// Prevent directory traversal
	if (filePath.includes("..")) {
		return new Response("Forbidden", { status: 403 });
	}

	const fullPath = join(STATIC_DIR, filePath);
	const file = Bun.file(fullPath);

	if (!(await file.exists())) {
		logger.debug(`Static file not found: ${filePath}`);
		return new Response("Not Found", { status: 404 });
	}

	return new Response(file, {
		headers: {
			"Content-Type": getMimeType(fullPath),
			"Cache-Control": "public, max-age=3600",
		},
	});
}

/**
 * Fallback handler for unmatched routes
 */
export function notFoundHandler(): Response {
	return new Response(
		JSON.stringify({
			success: false,
			error: "Resource not found",
			code: "NOT_FOUND",
		}),
		{
			status: 404,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
		},
	);
}
