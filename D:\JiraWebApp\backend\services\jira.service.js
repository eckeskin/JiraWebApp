/**
 * Jira Service
 * Handles all interactions with Jira REST API v2
 * Uses Bearer token authentication (Personal Access Token)
 */

const axios = require('axios');
const https = require('https');
const logger = require('../utils/logger');

class JiraService {
  constructor(baseUrl, token) {
    if (!baseUrl || !token) {
      throw new Error('Jira baseUrl and token are required');
    }

    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;

    // Configure axios instance with authentication
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 seconds
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Jira API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.response?.data?.errorMessages || error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Get details of a specific issue by key
   * @param {string} issueKey - The Jira issue key (e.g., "PBT-31929")
   * @returns {Promise<Object>} Issue details
   */
  async getIssue(issueKey) {
    try {
      logger.debug(`Fetching issue: ${issueKey}`);
      const response = await this.client.get(`/rest/api/2/issue/${issueKey}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Issue ${issueKey} not found`);
      }
      throw error;
    }
  }

  /**
   * Get available transitions for an issue
   * @param {string} issueKey - The Jira issue key
   * @returns {Promise<Array>} List of available transitions
   */
  async getTransitions(issueKey) {
    try {
      logger.debug(`Fetching transitions for: ${issueKey}`);
      const response = await this.client.get(`/rest/api/2/issue/${issueKey}/transitions`);
      return response.data.transitions || [];
    } catch (error) {
      throw new Error(`Failed to fetch transitions for ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Execute a transition on an issue (e.g., change status to "In Arbeit")
   * @param {string} issueKey - The Jira issue key
   * @param {string} transitionId - The ID of the transition to execute
   * @param {Object} fields - Optional fields to update during transition
   * @returns {Promise<void>}
   */
  async executeTransition(issueKey, transitionId, fields = {}) {
    try {
      logger.info(`Executing transition ${transitionId} on ${issueKey}`);

      const payload = {
        transition: {
          id: transitionId,
        },
      };

      if (Object.keys(fields).length > 0) {
        payload.fields = fields;
      }

      await this.client.post(`/rest/api/2/issue/${issueKey}/transitions`, payload);
      logger.info(`Successfully transitioned ${issueKey}`);
    } catch (error) {
      throw new Error(`Failed to execute transition on ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Find transition ID by name (e.g., "In Arbeit")
   * @param {string} issueKey - The Jira issue key
   * @param {string} transitionName - Name of the transition to find
   * @returns {Promise<string|null>} Transition ID or null if not found
   */
  async findTransitionIdByName(issueKey, transitionName) {
    const transitions = await this.getTransitions(issueKey);
    const transition = transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase()
    );
    return transition ? transition.id : null;
  }

  /**
   * Start a test plan by transitioning it to "In Arbeit"
   * @param {string} testPlanKey - The test plan issue key
   * @returns {Promise<Object>} Result with success status and message
   */
  async startTestPlan(testPlanKey) {
    try {
      // Find the "In Arbeit" transition
      const transitionId = await this.findTransitionIdByName(testPlanKey, 'In Arbeit');

      if (!transitionId) {
        throw new Error('Transition "In Arbeit" not found. Issue may already be in this status or transition is not available.');
      }

      await this.executeTransition(testPlanKey, transitionId);

      return {
        success: true,
        message: `Test Plan ${testPlanKey} successfully transitioned to "In Arbeit"`,
      };
    } catch (error) {
      logger.error(`Failed to start test plan ${testPlanKey}:`, error.message);
      throw error;
    }
  }

  /**
   * Search for Test Executions linked to a specific Test Plan using JQL
   * @param {string} testPlanKey - The test plan key (e.g., "PBT-31929")
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} List of test execution issues
   */
  async getTestExecutions(testPlanKey, maxResults = 50) {
    try {
      logger.debug(`Fetching test executions for test plan: ${testPlanKey}`);

      // JQL query as specified in requirements
      const jql = `issuetype = "Testausführung" AND "Test Plan" = ${testPlanKey}`;

      const response = await this.client.get('/rest/api/2/search', {
        params: {
          jql: jql,
          maxResults: maxResults,
          fields: 'summary,status,created,key,customfield_*', // Include all custom fields
          orderBy: 'created DESC', // Sort by created date descending
        },
      });

      return response.data.issues || [];
    } catch (error) {
      throw new Error(`Failed to fetch test executions for ${testPlanKey}: ${error.message}`);
    }
  }

  /**
   * Get the latest Test Execution for a Test Plan
   * @param {string} testPlanKey - The test plan key
   * @returns {Promise<Object|null>} Latest test execution or null if none found
   */
  async getLatestTestExecution(testPlanKey) {
    const executions = await this.getTestExecutions(testPlanKey, 1);
    return executions.length > 0 ? executions[0] : null;
  }

  /**
   * Get detailed test runs from Xray for a test execution
   * Xray-specific API endpoint
   * @param {string} executionKey - Test execution key
   * @returns {Promise<Array>} Array of test runs with status
   */
  async getXrayTestRuns(executionKey) {
    try {
      logger.debug(`Fetching Xray test runs for: ${executionKey}`);

      // Try Xray REST API v2 first (newer)
      try {
        const response = await this.client.get(`/rest/raven/2.0/api/testexec/${executionKey}/test`);
        logger.info(`Successfully fetched ${response.data?.length || 0} test runs from Xray API v2`);
        return response.data || [];
      } catch (error) {
        // If v2 fails, try v1
        logger.debug('Xray API v2 failed, trying v1...');
        const response = await this.client.get(`/rest/raven/1.0/api/testexec/${executionKey}/test`);
        logger.info(`Successfully fetched ${response.data?.length || 0} test runs from Xray API v1`);
        return response.data || [];
      }
    } catch (error) {
      logger.warn(`Failed to get Xray test runs for ${executionKey}:`, error.message);
      // Return empty array instead of throwing - we'll fall back to summary data
      return [];
    }
  }

  /**
   * Parse test execution details to extract test case results (XRAY FORMAT)
   * This method is adapted for Xray Test Management plugin
   * @param {Object} executionIssue - The test execution issue object
   * @returns {Promise<Object>} Parsed execution results
   */
  async parseTestExecutionResults(executionIssue) {
    try {
      // Extract basic information
      const result = {
        key: executionIssue.key,
        summary: executionIssue.fields.summary,
        status: executionIssue.fields.status?.name,
        created: executionIssue.fields.created,
        testCases: [],
        summary_stats: {
          total: 0,
          passed: 0,
          failed: 0,
          error: 0,
        },
      };

      const fields = executionIssue.fields;

      // ========================================
      // XRAY PLUGIN SPECIFIC PARSING
      // ========================================

      // customfield_10120 contains execution summary
      const xraySummary = fields.customfield_10120;
      if (xraySummary && xraySummary.statuses) {
        logger.info('[PARSE] Found Xray summary field (customfield_10120)');

        // Extract statistics from Xray summary
        xraySummary.statuses.forEach((statusObj) => {
          const statusName = statusObj.name?.toUpperCase() || '';
          const count = statusObj.statusCount || 0;

          if (statusName === 'PASS') {
            result.summary_stats.passed = count;
          } else if (statusName === 'FAIL') {
            result.summary_stats.failed = count;
          } else if (statusName === 'ABORTED' || statusName === 'ERROR') {
            result.summary_stats.error += count;
          }
        });

        result.summary_stats.total = xraySummary.count || 0;
      }

      // ========================================
      // GET DETAILED TEST RUNS FROM XRAY API
      // ========================================

      logger.info(`[XRAY CALL] Fetching detailed test runs for ${executionIssue.key} from Xray API...`);
      const xrayTestRuns = await this.getXrayTestRuns(executionIssue.key);
      logger.info(`[XRAY RESULT] Received ${xrayTestRuns?.length || 0} test runs from Xray API`);

      if (xrayTestRuns && xrayTestRuns.length > 0) {
        logger.info(`[PARSE] Found ${xrayTestRuns.length} test runs with detailed status`);

        xrayTestRuns.forEach((testRun) => {
          const testCase = {
            id: testRun.key || testRun.id?.toString() || 'Unknown',
            name: testRun.key || testRun.summary || 'Unknown Test',
            status: testRun.status || 'UNKNOWN',
            message: testRun.comment || testRun.defects?.join(', ') || '',
            testRunId: testRun.id,
          };

          result.testCases.push(testCase);
          logger.info(`[PARSE] Added test: ${testCase.id} - ${testCase.status}`);
        });
      } else {
        logger.warn('[PARSE] Xray API returned no test runs, using fallback strategy');

        // Create dummy entries from summary
        if (result.summary_stats.total > 0) {
          logger.info('[PARSE] Creating test case entries from summary statistics');

          // Create passed test entries
          for (let i = 0; i < result.summary_stats.passed; i++) {
            result.testCases.push({
              id: `PASS-${i + 1}`,
              name: `Passed Test ${i + 1}`,
              status: 'PASS',
              message: '',
            });
          }

          // Create failed test entries
          for (let i = 0; i < result.summary_stats.failed; i++) {
            result.testCases.push({
              id: `FAIL-${i + 1}`,
              name: `Failed Test ${i + 1}`,
              status: 'FAIL',
              message: 'Check Jira for details',
            });
          }

          // Create error test entries
          for (let i = 0; i < result.summary_stats.error; i++) {
            result.testCases.push({
              id: `ERROR-${i + 1}`,
              name: `Error Test ${i + 1}`,
              status: 'ERROR',
              message: 'Check Jira for details',
            });
          }
        }
      }

      logger.info(`[PARSE DONE] Execution ${result.key}: ${result.testCases.length} test cases found`);

      return result;
    } catch (error) {
      logger.error('[PARSE ERROR] Error parsing test execution results:', error);
      throw new Error(`Failed to parse test execution results: ${error.message}`);
    }
  }

  /**
   * Parse a single test case object
   * @param {Object} item - Test case data
   * @returns {Object|null} Parsed test case or null
   */
  parseTestCase(item) {
    // Try to extract common test case fields
    const testCase = {
      id: item.id || item.key || item.testCaseId || null,
      name: item.name || item.summary || item.testCaseName || 'Unknown',
      status: item.status || item.result || item.executionStatus || 'UNKNOWN',
      message: item.message || item.errorMessage || item.comment || '',
    };

    // Only return if we have at least an ID or name
    return testCase.id || testCase.name !== 'Unknown' ? testCase : null;
  }

  /**
   * Parse test results from an object
   * @param {Object} obj - Object containing test results
   * @returns {Array} Parsed test cases
   */
  parseTestResultsObject(obj) {
    const results = [];

    // Check if object has a results array
    if (obj.results && Array.isArray(obj.results)) {
      obj.results.forEach((item) => {
        const testCase = this.parseTestCase(item);
        if (testCase) {
          results.push(testCase);
        }
      });
    }

    // Check if object has tests array
    if (obj.tests && Array.isArray(obj.tests)) {
      obj.tests.forEach((item) => {
        const testCase = this.parseTestCase(item);
        if (testCase) {
          results.push(testCase);
        }
      });
    }

    return results;
  }

  /**
   * Parse test results from formatted text
   * @param {string} text - Formatted text containing test results
   * @returns {Array} Parsed test cases
   */
  parseTestResultsFromText(text) {
    const results = [];
    const lines = text.split('\n');

    // Look for common patterns like "TEST_ID: STATUS" or "TEST_NAME - STATUS"
    const patterns = [
      /^([A-Z0-9_-]+):\s*(PASS|FAIL|ERROR)/i,
      /^([A-Z0-9_-]+)\s*-\s*(PASS|FAIL|ERROR)/i,
      /^(.*?)\s*:\s*(PASS|FAIL|ERROR)/i,
    ];

    lines.forEach((line) => {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          results.push({
            id: match[1].trim(),
            name: match[1].trim(),
            status: match[2].toUpperCase(),
            message: '',
          });
          break;
        }
      }
    });

    return results;
  }

  /**
   * Add a comment to a Jira issue
   * @param {string} issueKey - The Jira issue key
   * @param {string} commentBody - The comment text
   * @returns {Promise<Object>} Created comment object
   */
  async addComment(issueKey, commentBody) {
    try {
      logger.info(`Adding comment to ${issueKey}`);
      const response = await this.client.post(`/rest/api/2/issue/${issueKey}/comment`, {
        body: commentBody,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to add comment to ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Update labels on a Jira issue
   * @param {string} issueKey - The Jira issue key
   * @param {Array<string>} labels - Array of label strings to set
   * @returns {Promise<void>}
   */
  async updateLabels(issueKey, labels) {
    try {
      logger.info(`Updating labels on ${issueKey}`);
      await this.client.put(`/rest/api/2/issue/${issueKey}`, {
        fields: {
          labels: labels,
        },
      });
    } catch (error) {
      throw new Error(`Failed to update labels on ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Add labels to a Jira issue (without removing existing ones)
   * @param {string} issueKey - The Jira issue key
   * @param {Array<string>} newLabels - Array of labels to add
   * @returns {Promise<void>}
   */
  async addLabels(issueKey, newLabels) {
    try {
      const issue = await this.getIssue(issueKey);
      const existingLabels = issue.fields.labels || [];
      const combinedLabels = [...new Set([...existingLabels, ...newLabels])];
      await this.updateLabels(issueKey, combinedLabels);
    } catch (error) {
      throw new Error(`Failed to add labels to ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Get multiple test plans with their details
   * @param {Array<string>} testPlanKeys - Array of test plan keys
   * @returns {Promise<Array>} Array of test plan details
   */
  async getTestPlans(testPlanKeys) {
    try {
      const promises = testPlanKeys.map(async (key) => {
        try {
          const issue = await this.getIssue(key);
          return {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status?.name,
            statusCategory: issue.fields.status?.statusCategory?.key,
            issueType: issue.fields.issuetype?.name,
            created: issue.fields.created,
            updated: issue.fields.updated,
          };
        } catch (error) {
          logger.warn(`Failed to fetch test plan ${key}:`, error.message);
          return {
            key: key,
            error: error.message,
          };
        }
      });

      return await Promise.all(promises);
    } catch (error) {
      throw new Error(`Failed to fetch test plans: ${error.message}`);
    }
  }
}

module.exports = JiraService;
