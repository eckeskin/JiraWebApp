/**
 * Jira Configuration Module
 * Loads and validates Jira-related configuration from environment variables
 */

require('dotenv').config();

const config = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    token: process.env.JIRA_PERSONAL_ACCESS_TOKEN,
    projectKey: process.env.JIRA_PROJECT_KEY || 'PBT',
  },
  testPlans: {
    // Parse comma-separated list of test plan keys
    keys: process.env.TEST_PLAN_KEYS
      ? process.env.TEST_PLAN_KEYS.split(',').map(key => key.trim())
      : [],
  },
  app: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  polling: {
    intervalSeconds: parseInt(process.env.POLL_INTERVAL || '30', 10),
  },
};

/**
 * Validates that all required configuration is present
 * @throws {Error} if required config is missing
 */
function validateConfig() {
  const errors = [];

  if (!config.jira.baseUrl) {
    errors.push('JIRA_BASE_URL is required');
  }

  if (!config.jira.token) {
    errors.push('JIRA_PERSONAL_ACCESS_TOKEN is required');
  }

  if (config.testPlans.keys.length === 0) {
    errors.push('TEST_PLAN_KEYS is required (comma-separated list)');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

module.exports = {
  config,
  validateConfig,
};
