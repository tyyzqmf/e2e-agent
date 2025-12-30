/**
 * Services Module
 * ================
 *
 * Re-exports all service components.
 */

// Prompt loading utilities
export {
  PROMPTS_DIR,
  TEMPLATES_DIR,
  UTILS_DIR,
  ROOT_DIR,
  validateProjectDirectory,
  validateDestName,
  loadPrompt,
  getTestPlannerPrompt,
  getTestExecutorPrompt,
  copyToProject,
  copyTestSpecToProject,
  copyTemplatesToProject,
  copyUtilsToProject,
  setupProjectDirectory,
} from "./prompts.ts";

// Progress tracking utilities
export {
  loadTestCases,
  countTestCases,
  countDefects,
  printTestSessionHeader,
  printTestProgressSummary,
  ProgressTracker,
} from "./progress.ts";

// Pricing calculator
export { PricingCalculator } from "./pricing.ts";

// Token usage tracking
export {
  TokenUsageTracker,
  CostReportGenerator,
  updateHtmlReportCostStatistics,
} from "./token-usage.ts";
