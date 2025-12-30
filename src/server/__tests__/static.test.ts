/**
 * Static Routes Tests
 *
 * Tests for static file serving and template routes using bun:test
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { buildStaticRoutes, notFoundHandler } from "../routes/static.ts";

describe("Static Routes", () => {
  let routes: ReturnType<typeof buildStaticRoutes>;

  beforeAll(() => {
    routes = buildStaticRoutes();
  });

  describe("buildStaticRoutes", () => {
    it("should return route handlers object", () => {
      expect(routes).toBeDefined();
      expect(typeof routes).toBe("object");
    });

    it("should have GET / route", () => {
      expect(routes["GET /"]).toBeDefined();
      expect(typeof routes["GET /"]).toBe("function");
    });

    it("should have GET /status/:id route", () => {
      expect(routes["GET /status/:id"]).toBeDefined();
      expect(typeof routes["GET /status/:id"]).toBe("function");
    });

    it("should have GET /jobs route", () => {
      expect(routes["GET /jobs"]).toBeDefined();
      expect(typeof routes["GET /jobs"]).toBe("function");
    });

    it("should have GET /static/* route", () => {
      expect(routes["GET /static/*"]).toBeDefined();
      expect(typeof routes["GET /static/*"]).toBe("function");
    });
  });

  describe("GET /", () => {
    it("should return a Response object", async () => {
      const handler = routes["GET /"];
      const response = await handler();

      expect(response).toBeInstanceOf(Response);
    });

    it("should return HTML content type when template exists", async () => {
      const handler = routes["GET /"];
      const response = await handler();

      // Either HTML content or 404 depending on template existence
      const status = response.status;
      expect([200, 404]).toContain(status);

      if (status === 200) {
        expect(response.headers.get("Content-Type")).toContain("text/html");
      }
    });
  });

  describe("GET /status/:id", () => {
    it("should handle request with job ID parameter", async () => {
      const handler = routes["GET /status/:id"];
      // Use valid UUID format (required by the handler)
      const validUuid = "12345678-1234-4abc-8def-123456789012";
      const req = new Request(`http://localhost/status/${validUuid}`);
      (req as any).params = { id: validUuid };

      const response = await handler(req);

      expect(response).toBeInstanceOf(Response);
    });

    it("should return Response for non-existent template", async () => {
      const handler = routes["GET /status/:id"];
      // Use valid UUID format (required by the handler)
      const validUuid = "12345678-1234-4123-8123-123456789abc";
      const req = new Request(`http://localhost/status/${validUuid}`);
      (req as any).params = { id: validUuid };

      const response = await handler(req);

      // Either success or 404 depending on template existence
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("GET /jobs", () => {
    it("should return a Response object", async () => {
      const handler = routes["GET /jobs"];
      const response = await handler();

      expect(response).toBeInstanceOf(Response);
    });
  });

  describe("GET /static/*", () => {
    it("should return 404 for non-existent file", async () => {
      const handler = routes["GET /static/*"];
      const req = new Request("http://localhost/static/non-existent.css");

      const response = await handler(req);

      expect(response.status).toBe(404);
    });

    it("should handle directory traversal attempt", async () => {
      const handler = routes["GET /static/*"];
      // Note: URL parser normalizes paths, so "../" in URL gets processed differently
      // The actual check in serveStatic looks for ".." in the file path after URL parsing
      const req = new Request("http://localhost/static/..%2F..%2Fetc/passwd");

      const response = await handler(req);

      // Should either be 403 (if .. detected) or 404 (file not found)
      // The URL normalization may remove the .. before it reaches the handler
      expect([403, 404]).toContain(response.status);
    });

    it("should prevent directory traversal with encoded paths", async () => {
      const handler = routes["GET /static/*"];
      const req = new Request("http://localhost/static/..%2F..%2Fetc/passwd");

      const response = await handler(req);

      // Should either be 403 (forbidden) or 404 (not found)
      expect([403, 404]).toContain(response.status);
    });
  });

  describe("notFoundHandler", () => {
    it("should return 404 status", () => {
      const response = notFoundHandler();

      expect(response.status).toBe(404);
    });

    it("should return JSON response", async () => {
      const response = notFoundHandler();
      const contentType = response.headers.get("Content-Type");

      expect(contentType).toContain("application/json");
    });

    it("should include error details", async () => {
      const response = notFoundHandler();
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.code).toBe("NOT_FOUND");
      expect(data.error).toBeDefined();
    });

    it("should have English error message", async () => {
      const response = notFoundHandler();
      const data = await response.json();

      expect(data.error).toBe("Resource not found");
    });
  });
});

describe("MIME Types", () => {
  let routes: ReturnType<typeof buildStaticRoutes>;

  beforeAll(() => {
    routes = buildStaticRoutes();
  });

  // These tests verify the MIME type logic indirectly
  // The actual serving depends on file existence

  it("should handle CSS file requests", async () => {
    const handler = routes["GET /static/*"];
    const req = new Request("http://localhost/static/styles.css");

    const response = await handler(req);

    // File doesn't exist, but we can verify the handler runs
    expect(response).toBeInstanceOf(Response);
  });

  it("should handle JavaScript file requests", async () => {
    const handler = routes["GET /static/*"];
    const req = new Request("http://localhost/static/app.js");

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
  });

  it("should handle image file requests", async () => {
    const handler = routes["GET /static/*"];
    const req = new Request("http://localhost/static/logo.png");

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
  });

  it("should handle JSON file requests", async () => {
    const handler = routes["GET /static/*"];
    const req = new Request("http://localhost/static/data.json");

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
  });
});

describe("Template Variable Substitution", () => {
  // This tests the template serving with variables
  // The actual substitution happens in serveTemplate which is private

  it("should handle status page with job ID", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /status/:id"];

    // Use valid UUID format (required by the handler)
    const jobId = "abc12345-1234-4567-8901-123456789abc";
    const req = new Request(`http://localhost/status/${jobId}`);
    (req as any).params = { id: jobId };

    const response = await handler(req);

    // The response should be valid (either template found or 404)
    expect(response).toBeInstanceOf(Response);
    expect([200, 404]).toContain(response.status);
  });
});

describe("Static File Serving with Actual Files", () => {
  it("should serve existing CSS file with correct MIME type", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /static/*"];
    // Use the actual CSS file that exists
    const req = new Request("http://localhost/static/css/style.css");

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/css");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("should serve existing JavaScript file with correct MIME type", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /static/*"];
    // Use the actual JS file that exists
    const req = new Request("http://localhost/static/js/index.js");

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/javascript");
  });

  it("should handle various file extensions", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /static/*"];

    // Test various extensions that don't exist (404 expected)
    const extensions = [".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"];

    for (const ext of extensions) {
      const req = new Request(`http://localhost/static/file${ext}`);
      const response = await handler(req);
      expect(response).toBeInstanceOf(Response);
    }
  });

  it("should return 404 for non-existent static file", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /static/*"];
    const req = new Request("http://localhost/static/nonexistent.txt");

    const response = await handler(req);

    expect(response.status).toBe(404);
  });
});

describe("Template Serving", () => {
  it("should serve index.html template", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /"];

    const response = await handler();

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  it("should serve jobs.html template", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /jobs"];

    const response = await handler();

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  it("should serve status.html template with variable substitution", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /status/:id"];

    // Use valid UUID format (required by the handler)
    const jobId = "12345678-1234-4567-8901-abcdef123456";
    const req = new Request(`http://localhost/status/${jobId}`);
    (req as any).params = { id: jobId };

    const response = await handler(req);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");

    // Check if job_id is substituted in the response
    const html = await response.text();
    expect(html).toContain(jobId);
  });
});

describe("Directory Traversal Prevention", () => {
  it("should block direct .. in path", async () => {
    const routes = buildStaticRoutes();
    const handler = routes["GET /static/*"];

    // Try with explicit .. in the path
    const req = new Request("http://localhost/static/../../../etc/passwd");

    const response = await handler(req);

    // Should be either 403 (forbidden) or 404 (not found)
    expect([403, 404]).toContain(response.status);
  });
});
