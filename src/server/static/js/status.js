/**
 * E2E Test Agent - Job Status Page
 */

// Get job ID from URL
const pathParts = window.location.pathname.split("/");
const jobId = pathParts[pathParts.length - 1];

// Auto-refresh interval (5 seconds)
let refreshInterval = null;
const REFRESH_INTERVAL_MS = 5000;

document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("jobId").textContent = jobId;
	loadJobStatus();
});

/**
 * Load job status from API
 */
async function loadJobStatus() {
	const loading = document.getElementById("loading");
	const jobDetails = document.getElementById("jobDetails");
	const errorState = document.getElementById("errorState");

	try {
		const response = await fetch(`/api/jobs/${jobId}`);
		const data = await response.json();

		loading.classList.add("hidden");

		if (!data.success) {
			errorState.classList.remove("hidden");
			stopAutoRefresh();
			return;
		}

		const job = data.job;
		jobDetails.classList.remove("hidden");

		// Update status
		updateStatus(job);

		// Update timestamps
		document.getElementById("createdAt").textContent = formatDate(
			job.created_at,
		);

		const startedRow = document.getElementById("startedRow");
		const completedRow = document.getElementById("completedRow");
		const errorRow = document.getElementById("errorRow");

		if (job.started_at) {
			startedRow.classList.remove("hidden");
			document.getElementById("startedAt").textContent = formatDate(
				job.started_at,
			);
		} else {
			startedRow.classList.add("hidden");
		}

		if (job.completed_at) {
			completedRow.classList.remove("hidden");
			document.getElementById("completedAt").textContent = formatDate(
				job.completed_at,
			);
		} else {
			completedRow.classList.add("hidden");
		}

		if (job.error_message) {
			errorRow.classList.remove("hidden");
			document.getElementById("errorMessage").textContent = job.error_message;
		} else {
			errorRow.classList.add("hidden");
		}

		// Update summary
		updateSummary(job.summary);

		// Update cost
		updateCost(job.cost);

		// Update action buttons
		updateActions(job);

		// Auto-refresh for active jobs
		if (["pending", "queued", "running"].includes(job.status)) {
			startAutoRefresh();
		} else {
			stopAutoRefresh();
		}
	} catch (error) {
		loading.classList.add("hidden");
		errorState.classList.remove("hidden");
		console.error("Error loading job status:", error);
		stopAutoRefresh();
	}
}

/**
 * Update status badge
 */
function updateStatus(job) {
	const statusEl = document.getElementById("status");
	statusEl.textContent = formatStatus(job.status);
	statusEl.className = `status-badge status-${job.status}`;
}

/**
 * Update test summary
 */
function updateSummary(summary) {
	const summaryEl = document.getElementById("summary");

	if (!summary) {
		summaryEl.classList.add("hidden");
		return;
	}

	summaryEl.classList.remove("hidden");
	document.getElementById("totalCount").textContent = summary.total || 0;
	document.getElementById("passedCount").textContent = summary.passed || 0;
	document.getElementById("failedCount").textContent = summary.failed || 0;
	document.getElementById("blockedCount").textContent = summary.blocked || 0;
	document.getElementById("notRunCount").textContent = summary.not_run || 0;
}

/**
 * Update cost statistics
 */
function updateCost(cost) {
	const costEl = document.getElementById("cost");

	if (!cost) {
		costEl.classList.add("hidden");
		return;
	}

	costEl.classList.remove("hidden");
	document.getElementById("inputTokens").textContent = formatNumber(
		cost.input_tokens || 0,
	);
	document.getElementById("outputTokens").textContent = formatNumber(
		cost.output_tokens || 0,
	);
	document.getElementById("totalCost").textContent =
		`$${(cost.total_cost || 0).toFixed(4)}`;
}

/**
 * Update action buttons based on job status
 */
function updateActions(job) {
	const stopBtn = document.getElementById("stopBtn");
	const reportBtn = document.getElementById("reportBtn");
	const downloadBtn = document.getElementById("downloadBtn");

	// Stop button - only for active jobs
	if (["running", "queued"].includes(job.status)) {
		stopBtn.classList.remove("hidden");
	} else {
		stopBtn.classList.add("hidden");
	}

	// Report and download buttons - only for completed jobs
	if (["completed", "failed", "stopped"].includes(job.status)) {
		reportBtn.classList.remove("hidden");
		reportBtn.href = `/api/jobs/${jobId}/report`;

		downloadBtn.classList.remove("hidden");
		downloadBtn.href = `/api/jobs/${jobId}/download`;
	} else {
		reportBtn.classList.add("hidden");
		downloadBtn.classList.add("hidden");
	}
}

/**
 * Stop the job
 */
async function _stopJob() {
	if (!confirm("Are you sure you want to stop this job?")) {
		return;
	}

	try {
		const response = await fetch(`/api/jobs/${jobId}/stop`, {
			method: "POST",
		});
		const data = await response.json();

		if (data.success) {
			loadJobStatus();
		} else {
			alert(data.error || "Failed to stop job");
		}
	} catch (error) {
		alert(`Failed to stop job: ${error.message}`);
	}
}

/**
 * Refresh status manually
 */
function _refreshStatus() {
	loadJobStatus();
}

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
	if (!refreshInterval) {
		refreshInterval = setInterval(loadJobStatus, REFRESH_INTERVAL_MS);
	}
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
	if (refreshInterval) {
		clearInterval(refreshInterval);
		refreshInterval = null;
	}
}

/**
 * Format date string
 */
function formatDate(dateStr) {
	if (!dateStr) return "-";
	const date = new Date(dateStr);
	return date.toLocaleString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * Format status for display
 */
function formatStatus(status) {
	const statusMap = {
		pending: "Pending",
		queued: "Queued",
		running: "Running",
		completed: "Completed",
		failed: "Failed",
		stopped: "Stopped",
	};
	return statusMap[status] || status;
}

/**
 * Format number with thousands separator
 */
function formatNumber(num) {
	return num.toLocaleString();
}
