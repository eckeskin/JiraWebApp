/**
 * Jira Test Manager - Express Server
 * Local web application for managing Jira test plans and executions
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { config, validateConfig } = require('./config/jira.config');
const JiraService = require('./services/jira.service');
const createApiRouter = require('./routes/api.routes');
const logger = require('./utils/logger');

// Validate configuration before starting
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed:', error.message);
  process.exit(1);
}

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for local development
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Initialize Jira service
let jiraService;
try {
  jiraService = new JiraService(config.jira.baseUrl, config.jira.token);
  logger.info('Jira service initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Jira service:', error.message);
  process.exit(1);
}

// API routes
app.use('/api', createApiRouter(jiraService, config));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: config.app.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Start server
const server = app.listen(config.app.port, () => {
  logger.info('='.repeat(60));
  logger.info('Jira Test Manager - Server Started');
  logger.info('='.repeat(60));
  logger.info(`Environment: ${config.app.nodeEnv}`);
  logger.info(`Server running on: http://localhost:${config.app.port}`);
  logger.info(`Jira instance: ${config.jira.baseUrl}`);
  logger.info(`Configured test plans: ${config.testPlans.keys.join(', ')}`);
  logger.info(`Poll interval: ${config.polling.intervalSeconds} seconds`);
  logger.info('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
