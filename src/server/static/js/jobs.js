/**
 * E2E Test Agent - Job List Page
 */

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
	if (str === null || str === undefined) return "";
	const div = document.createElement("div");
	div.textContent = String(str);
	return div.innerHTML;
}

// Pagination state
let currentPage = 1;
const PAGE_SIZE = 20;
let totalJobs = 0;

document.addEventListener("DOMContentLoaded", () => {
	loadJobs();
});

/**
 * Load jobs from API
 */
async function loadJobs() {
	const loading = document.getElementById("loading");
	const emptyState = document.getElementById("emptyState");
	const jobList = document.getElementById("jobList");
	const pagination = document.getElementById("pagination");

	loading.classList.remove("hidden");
	emptyState.classList.add("hidden");
	jobList.classList.add("hidden");

	try {
		const response = await fetch(`/api/jobs?limit=1000`);
		const data = await response.json();

		loading.classList.add("hidden");

		if (!data.success || !data.jobs || data.jobs.length === 0) {
			emptyState.classList.remove("hidden");
			pagination.classList.add("hidden");
			return;
		}

		totalJobs = data.jobs.length;
		const jobs = data.jobs;

		// Sort by created_at descending
		jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

		// Paginate
		const startIndex = (currentPage - 1) * PAGE_SIZE;
		const endIndex = Math.min(startIndex + PAGE_SIZE, totalJobs);
		const pageJobs = jobs.slice(startIndex, endIndex);

		// Render jobs
		renderJobs(pageJobs);

		jobList.classList.remove("hidden");

		// Update pagination
		updatePagination();
	} catch (error) {
		loading.classList.add("hidden");
		emptyState.classList.remove("hidden");
		console.error("Error loading jobs:", error);
	}
}

/**
 * Render jobs to table using DOM APIs to prevent XSS
 */
function renderJobs(jobs) {
	const tbody = document.getElementById("jobTableBody");
	tbody.innerHTML = "";

	jobs.forEach((job) => {
		const row = document.createElement("tr");

		// Job ID cell with link
		const idCell = document.createElement("td");
		const idLink = document.createElement("a");
		const safeJobId = escapeHtml(job.job_id);
		idLink.href = `/status/${encodeURIComponent(job.job_id)}`;
		idLink.title = safeJobId;
		idLink.textContent = job.job_id ? `${job.job_id.substring(0, 8)}...` : "";
		idCell.appendChild(idLink);
		row.appendChild(idCell);

		// Status cell
		const statusCell = document.createElement("td");
		const statusBadge = document.createElement("span");
		const safeStatus = escapeHtml(job.status);
		statusBadge.className = `status-badge status-${safeStatus}`;
		statusBadge.textContent = formatStatus(job.status);
		statusCell.appendChild(statusBadge);
		row.appendChild(statusCell);

		// Date cells
		const createdCell = document.createElement("td");
		createdCell.textContent = formatDate(job.created_at);
		row.appendChild(createdCell);

		const startedCell = document.createElement("td");
		startedCell.textContent = formatDate(job.started_at);
		row.appendChild(startedCell);

		const completedCell = document.createElement("td");
		completedCell.textContent = formatDate(job.completed_at);
		row.appendChild(completedCell);

		// Action cell
		const actionCell = document.createElement("td");
		const viewLink = document.createElement("a");
		viewLink.href = `/status/${encodeURIComponent(job.job_id)}`;
		viewLink.className = "btn-secondary";
		viewLink.style.cssText = "padding: 0.25rem 0.75rem; font-size: 0.875rem;";
		viewLink.textContent = "View";
		actionCell.appendChild(viewLink);
		row.appendChild(actionCell);

		tbody.appendChild(row);
	});
}

/**
 * Update pagination controls
 */
function updatePagination() {
	const pagination = document.getElementById("pagination");
	const prevBtn = document.getElementById("prevBtn");
	const nextBtn = document.getElementById("nextBtn");
	const pageInfo = document.getElementById("pageInfo");

	const totalPages = Math.ceil(totalJobs / PAGE_SIZE);

	if (totalPages <= 1) {
		pagination.classList.add("hidden");
		return;
	}

	pagination.classList.remove("hidden");

	prevBtn.disabled = currentPage === 1;
	nextBtn.disabled = currentPage === totalPages;

	pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

/**
 * Go to previous page
 */
function _prevPage() {
	if (currentPage > 1) {
		currentPage--;
		loadJobs();
	}
}

/**
 * Go to next page
 */
function _nextPage() {
	const totalPages = Math.ceil(totalJobs / PAGE_SIZE);
	if (currentPage < totalPages) {
		currentPage++;
		loadJobs();
	}
}

/**
 * Refresh jobs
 */
function _refreshJobs() {
	currentPage = 1;
	loadJobs();
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
