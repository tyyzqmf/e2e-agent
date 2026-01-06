/**
 * E2E Test Agent - Job Submission Page
 */

document.addEventListener("DOMContentLoaded", () => {
	const form = document.getElementById("submitForm");
	const submitBtn = document.getElementById("submitBtn");
	const result = document.getElementById("result");
	const resultSuccess = document.querySelector(".result-success");
	const resultError = document.querySelector(".result-error");
	const jobIdEl = document.getElementById("jobId");
	const statusLink = document.getElementById("statusLink");
	const errorMessage = document.getElementById("errorMessage");

	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		// Disable submit button
		submitBtn.disabled = true;
		submitBtn.textContent = "Submitting...";

		// Hide previous results
		result.classList.add("hidden");
		resultSuccess.classList.add("hidden");
		resultError.classList.add("hidden");

		try {
			// Gather form data
			const testSpec = document.getElementById("testSpec").value.trim();
			const envConfig = gatherEnvConfig();

			// Submit job
			const response = await fetch("/api/jobs", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					test_spec: testSpec,
					env_config: envConfig,
				}),
			});

			const data = await response.json();

			if (data.success) {
				// Show success
				jobIdEl.textContent = data.job_id;
				statusLink.href = `/status/${data.job_id}`;
				result.classList.remove("hidden");
				resultSuccess.classList.remove("hidden");
			} else {
				// Show error
				errorMessage.textContent = data.error || "Unknown error";
				result.classList.remove("hidden");
				resultError.classList.remove("hidden");
			}
		} catch (error) {
			// Show error
			errorMessage.textContent = error.message || "Failed to submit job";
			result.classList.remove("hidden");
			resultError.classList.remove("hidden");
		} finally {
			// Re-enable submit button
			submitBtn.disabled = false;
			submitBtn.textContent = "Submit Job";
		}
	});
});

/**
 * Gather environment configuration from form
 */
function gatherEnvConfig() {
	const config = {};
	const rows = document.querySelectorAll(".env-row");

	rows.forEach((row) => {
		const key = row.querySelector(".env-key").value.trim();
		const value = row.querySelector(".env-value").value.trim();
		if (key) {
			config[key] = value;
		}
	});

	return config;
}

/**
 * Add a new environment variable row
 */
function _addEnvRow() {
	const container = document.getElementById("envFields");
	const row = document.createElement("div");
	row.className = "env-row";
	row.innerHTML = `
    <input type="text" placeholder="Key" class="env-key">
    <input type="text" placeholder="Value" class="env-value">
    <button type="button" class="btn-remove" onclick="removeEnvRow(this)">-</button>
  `;
	container.appendChild(row);
}

/**
 * Remove an environment variable row
 */
function _removeEnvRow(button) {
	const row = button.parentElement;
	const container = document.getElementById("envFields");

	// Keep at least one row
	if (container.children.length > 1) {
		row.remove();
	} else {
		// Clear the row instead
		row.querySelector(".env-key").value = "";
		row.querySelector(".env-value").value = "";
	}
}
