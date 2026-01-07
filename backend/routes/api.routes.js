/**
 * API Routes
 * Defines all REST API endpoints for the Jira Test Manager
 */

const express = require('express');
const logger = require('../utils/logger');

/**
 * Creates and configures API routes
 * @param {JiraService} jiraService - Instance of JiraService
 * @param {Object} config - Application configuration
 * @returns {express.Router} Configured Express router
 */
function createApiRouter(jiraService, config) {
  const router = express.Router();

  /**
   * GET /api/test-plans
   * Get all configured test plans with their current status
   */
  router.get('/test-plans', async (req, res) => {
    try {
      logger.info('Fetching test plans');
      const testPlans = await jiraService.getTestPlans(config.testPlans.keys);
      res.json({
        success: true,
        data: testPlans,
      });
    } catch (error) {
      logger.error('Error fetching test plans:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/test-plans/:key
   * Get details of a specific test plan
   */
  router.get('/test-plans/:key', async (req, res) => {
    try {
      const { key } = req.params;
      logger.info(`Fetching test plan: ${key}`);

      const issue = await jiraService.getIssue(key);

      res.json({
        success: true,
        data: {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          statusCategory: issue.fields.status?.statusCategory?.key,
          description: issue.fields.description,
          created: issue.fields.created,
          updated: issue.fields.updated,
        },
      });
    } catch (error) {
      logger.error(`Error fetching test plan ${req.params.key}:`, error);
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/test-plans/:key/start
   * Start a test plan by transitioning it to "In Arbeit"
   * This will trigger Jenkins to start the test execution
   */
  router.post('/test-plans/:key/start', async (req, res) => {
    try {
      const { key } = req.params;
      logger.info(`Starting test plan: ${key}`);

      // Validate that this is a configured test plan
      if (!config.testPlans.keys.includes(key)) {
        return res.status(400).json({
          success: false,
          error: `Test plan ${key} is not configured in TEST_PLAN_KEYS`,
        });
      }

      const result = await jiraService.startTestPlan(key);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error(`Error starting test plan ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/test-plans/:key/executions
   * Get all test executions for a test plan
   */
  router.get('/test-plans/:key/executions', async (req, res) => {
    try {
      const { key } = req.params;
      const maxResults = parseInt(req.query.maxResults || '50', 10);

      logger.info(`Fetching test executions for test plan: ${key}`);

      const executions = await jiraService.getTestExecutions(key, maxResults);

      // Transform executions to include only relevant data
      const transformedExecutions = executions.map((exec) => ({
        key: exec.key,
        summary: exec.fields.summary,
        status: exec.fields.status?.name,
        created: exec.fields.created,
      }));

      res.json({
        success: true,
        data: transformedExecutions,
      });
    } catch (error) {
      logger.error(`Error fetching test executions for ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/test-plans/:key/executions/latest
   * Get the latest test execution for a test plan
   */
  router.get('/test-plans/:key/executions/latest', async (req, res) => {
    try {
      const { key } = req.params;
      logger.info(`Fetching latest test execution for test plan: ${key}`);

      const execution = await jiraService.getLatestTestExecution(key);

      if (!execution) {
        return res.json({
          success: true,
          data: null,
          message: 'No test executions found',
        });
      }

      res.json({
        success: true,
        data: {
          key: execution.key,
          summary: execution.fields.summary,
          status: execution.fields.status?.name,
          created: execution.fields.created,
        },
      });
    } catch (error) {
      logger.error(`Error fetching latest test execution for ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/executions/:key
   * Get detailed test execution results including test cases
   */
  router.get('/executions/:key', async (req, res) => {
    try {
      const { key } = req.params;
      logger.info(`Fetching test execution details: ${key}`);

      const execution = await jiraService.getIssue(key);
      const parsedResults = jiraService.parseTestExecutionResults(execution);

      res.json({
        success: true,
        data: parsedResults,
      });
    } catch (error) {
      logger.error(`Error fetching test execution ${req.params.key}:`, error);
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/executions/:key/failed-tests
   * Get only the failed test cases from an execution
   */
  router.get('/executions/:key/failed-tests', async (req, res) => {
    try {
      const { key } = req.params;
      logger.info(`Fetching failed tests for execution: ${key}`);

      const execution = await jiraService.getIssue(key);
      const parsedResults = jiraService.parseTestExecutionResults(execution);

      // Filter for failed tests only
      const failedTests = parsedResults.testCases.filter((test) => {
        const status = test.status?.toLowerCase() || '';
        return status === 'fail' || status === 'failed' || status === 'error';
      });

      res.json({
        success: true,
        data: {
          executionKey: key,
          totalFailed: failedTests.length,
          failedTests: failedTests,
        },
      });
    } catch (error) {
      logger.error(`Error fetching failed tests for ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/executions/:key/comment
   * Add a comment to a test execution
   */
  router.post('/executions/:key/comment', async (req, res) => {
    try {
      const { key } = req.params;
      const { comment } = req.body;

      if (!comment || typeof comment !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Comment text is required',
        });
      }

      logger.info(`Adding comment to execution: ${key}`);

      const result = await jiraService.addComment(key, comment);

      res.json({
        success: true,
        message: 'Comment added successfully',
        data: result,
      });
    } catch (error) {
      logger.error(`Error adding comment to ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/executions/:key/labels
   * Add labels to a test execution
   */
  router.post('/executions/:key/labels', async (req, res) => {
    try {
      const { key } = req.params;
      const { labels } = req.body;

      if (!Array.isArray(labels) || labels.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Labels array is required',
        });
      }

      logger.info(`Adding labels to execution: ${key}`);

      await jiraService.addLabels(key, labels);

      res.json({
        success: true,
        message: 'Labels added successfully',
      });
    } catch (error) {
      logger.error(`Error adding labels to ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/config
   * Get application configuration (sanitized - no tokens)
   */
  router.get('/config', (req, res) => {
    res.json({
      success: true,
      data: {
        jiraBaseUrl: config.jira.baseUrl,
        testPlanKeys: config.testPlans.keys,
        pollIntervalSeconds: config.polling.intervalSeconds,
      },
    });
  });

  /**
   * GET /api/health
   * Health check endpoint
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = createApiRouter;
