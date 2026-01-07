/**
 * Jira Test Manager - Frontend Application
 * Handles UI interactions and API communication
 */

// Application State
const state = {
  testPlans: [],
  currentExecution: null,
  currentTestPlan: null,
  config: null,
  polling: {
    active: false,
    intervalId: null,
    testPlanKey: null,
    startTime: null,
    lastExecutionKey: null,
  },
  currentTab: 'all',
};

// API Base URL
const API_BASE = '/api';

// Utility Functions
const utils = {
  /**
   * Show status message
   */
  showStatus(message, type = 'info') {
    const statusBar = document.getElementById('statusBar');
    const statusMessage = document.getElementById('statusMessage');

    statusMessage.textContent = message;
    statusBar.className = 'status-bar';

    if (type !== 'info') {
      statusBar.classList.add(type);
    }

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        statusBar.className = 'status-bar';
        statusMessage.textContent = 'Ready';
      }, 5000);
    }
  },

  /**
   * Format date string
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      utils.showStatus('Copied to clipboard!', 'success');
    } catch (error) {
      console.error('Failed to copy:', error);
      utils.showStatus('Failed to copy to clipboard', 'error');
    }
  },

  /**
   * Download text as file
   */
  downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// API Functions
const api = {
  /**
   * Generic API request handler
   */
  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  /**
   * Get all test plans
   */
  async getTestPlans() {
    return await this.request('/test-plans');
  },

  /**
   * Get test plan details
   */
  async getTestPlan(key) {
    return await this.request(`/test-plans/${key}`);
  },

  /**
   * Start a test plan
   */
  async startTestPlan(key) {
    return await this.request(`/test-plans/${key}/start`, {
      method: 'POST',
    });
  },

  /**
   * Get test executions for a test plan
   */
  async getTestExecutions(key) {
    return await this.request(`/test-plans/${key}/executions`);
  },

  /**
   * Get latest test execution for a test plan
   */
  async getLatestTestExecution(key) {
    return await this.request(`/test-plans/${key}/executions/latest`);
  },

  /**
   * Get execution details
   */
  async getExecutionDetails(key) {
    return await this.request(`/executions/${key}`);
  },

  /**
   * Get failed tests
   */
  async getFailedTests(key) {
    return await this.request(`/executions/${key}/failed-tests`);
  },

  /**
   * Add comment to execution
   */
  async addComment(key, comment) {
    return await this.request(`/executions/${key}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  /**
   * Add labels to execution
   */
  async addLabels(key, labels) {
    return await this.request(`/executions/${key}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });
  },

  /**
   * Get application config
   */
  async getConfig() {
    return await this.request('/config');
  },
};

// UI Rendering Functions
const ui = {
  /**
   * Render test plans list
   */
  renderTestPlans(testPlans) {
    const container = document.getElementById('testPlansContainer');

    if (testPlans.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No Test Plans Found</div>
          <div class="empty-state-description">Please check your configuration.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = testPlans
      .map((plan) => {
        if (plan.error) {
          return `
            <div class="test-plan-card">
              <div class="test-plan-header">
                <div class="test-plan-key">${plan.key}</div>
                <span class="status-badge" style="background: #ffebe6; color: #bf2600;">ERROR</span>
              </div>
              <p class="test-plan-summary">Error: ${plan.error}</p>
            </div>
          `;
        }

        const statusCategory = plan.statusCategory || 'new';
        return `
          <div class="test-plan-card" data-key="${plan.key}">
            <div class="test-plan-header">
              <div class="test-plan-key">${plan.key}</div>
              <span class="status-badge ${statusCategory}">${plan.status || 'Unknown'}</span>
            </div>
            <p class="test-plan-summary">${plan.summary || 'No summary available'}</p>
            <div class="test-plan-meta">
              Updated: ${utils.formatDate(plan.updated)}
            </div>
            <div class="test-plan-actions">
              <button class="btn btn-success start-test-btn" data-key="${plan.key}">
                Start Test
              </button>
              <button class="btn btn-secondary view-executions-btn" data-key="${plan.key}">
                View Executions
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach event listeners
    container.querySelectorAll('.start-test-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = e.target.dataset.key;
        handlers.startTestPlan(key);
      });
    });

    container.querySelectorAll('.view-executions-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = e.target.dataset.key;
        handlers.viewExecutions(key);
      });
    });
  },

  /**
   * Render execution summary
   */
  renderExecutionSummary(execution) {
    const container = document.getElementById('executionSummary');

    const stats = execution.summary_stats || { total: 0, passed: 0, failed: 0, error: 0 };

    container.innerHTML = `
      <div class="execution-info">
        <div class="info-item">
          <div class="info-label">Execution Key</div>
          <div class="info-value">${execution.key}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value">${execution.status || 'Unknown'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Created</div>
          <div class="info-value">${utils.formatDate(execution.created)}</div>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value total">${stats.total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-box">
          <div class="stat-value passed">${stats.passed}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value failed">${stats.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value error">${stats.error}</div>
          <div class="stat-label">Error</div>
        </div>
      </div>
    `;
  },

  /**
   * Render test cases
   */
  renderTestCases(testCases, filter = 'all') {
    const container = document.getElementById('testCasesContainer');

    // Filter test cases based on current tab
    let filteredCases = testCases;
    if (filter === 'failed') {
      filteredCases = testCases.filter((tc) => {
        const status = tc.status?.toLowerCase() || '';
        return status === 'fail' || status === 'failed' || status === 'error';
      });
    } else if (filter === 'passed') {
      filteredCases = testCases.filter((tc) => {
        const status = tc.status?.toLowerCase() || '';
        return status === 'pass' || status === 'passed';
      });
    }

    if (filteredCases.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <div class="empty-state-title">No ${filter} tests found</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredCases
      .map((testCase) => {
        const status = testCase.status?.toLowerCase() || 'unknown';
        const statusClass = status === 'pass' || status === 'passed' ? 'pass' : status === 'fail' || status === 'failed' ? 'fail' : 'error';

        return `
          <div class="test-case">
            <div class="test-case-info">
              <div class="test-case-id">${testCase.id || 'Unknown ID'}</div>
              <div class="test-case-name">${testCase.name || ''}</div>
              ${testCase.message ? `<div class="test-case-message">${testCase.message}</div>` : ''}
            </div>
            <div class="test-case-status ${statusClass}">${testCase.status || 'Unknown'}</div>
          </div>
        `;
      })
      .join('');
  },

  /**
   * Show execution section
   */
  showExecutionSection() {
    document.getElementById('executionSection').style.display = 'block';
    // Scroll to execution section
    document.getElementById('executionSection').scrollIntoView({ behavior: 'smooth' });
  },

  /**
   * Hide execution section
   */
  hideExecutionSection() {
    document.getElementById('executionSection').style.display = 'none';
  },

  /**
   * Show modal
   */
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
  },

  /**
   * Hide modal
   */
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
  },
};

// Polling Functions
const polling = {
  /**
   * Start polling for new test execution
   */
  async start(testPlanKey) {
    if (state.polling.active) {
      console.warn('Polling already active');
      return;
    }

    state.polling.active = true;
    state.polling.testPlanKey = testPlanKey;
    state.polling.startTime = Date.now();

    // Get current latest execution to compare
    try {
      const result = await api.getLatestTestExecution(testPlanKey);
      state.polling.lastExecutionKey = result.data?.key || null;
    } catch (error) {
      console.error('Error getting initial execution:', error);
    }

    // Show polling modal
    ui.showModal('pollingModal');

    // Start polling interval
    const intervalSeconds = state.config?.pollIntervalSeconds || 30;
    state.polling.intervalId = setInterval(async () => {
      await polling.check();
    }, intervalSeconds * 1000);

    // Start timer update
    polling.updateTimer();
  },

  /**
   * Check for new test execution
   */
  async check() {
    if (!state.polling.active) {
      return;
    }

    try {
      const result = await api.getLatestTestExecution(state.polling.testPlanKey);

      if (result.data) {
        const latestKey = result.data.key;

        // Check if this is a new execution
        if (latestKey !== state.polling.lastExecutionKey) {
          console.log('New test execution detected:', latestKey);
          await polling.handleNewExecution(latestKey);
        }
      }
    } catch (error) {
      console.error('Error checking for new execution:', error);
      utils.showStatus('Error polling for test execution', 'error');
    }
  },

  /**
   * Handle detection of new test execution
   */
  async handleNewExecution(executionKey) {
    polling.stop();

    utils.showStatus('New test execution detected!', 'success');

    // Load execution details
    try {
      const result = await api.getExecutionDetails(executionKey);
      state.currentExecution = result.data;

      ui.renderExecutionSummary(state.currentExecution);
      ui.renderTestCases(state.currentExecution.testCases, state.currentTab);
      ui.showExecutionSection();
    } catch (error) {
      console.error('Error loading execution details:', error);
      utils.showStatus('Failed to load execution details', 'error');
    }
  },

  /**
   * Update polling timer display
   */
  updateTimer() {
    if (!state.polling.active) {
      return;
    }

    const elapsed = Math.floor((Date.now() - state.polling.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    const timerEl = document.getElementById('pollingTimer');
    if (timerEl) {
      timerEl.textContent = `Elapsed: ${minutes}m ${seconds}s`;
    }

    setTimeout(() => polling.updateTimer(), 1000);
  },

  /**
   * Stop polling
   */
  stop() {
    if (state.polling.intervalId) {
      clearInterval(state.polling.intervalId);
      state.polling.intervalId = null;
    }

    state.polling.active = false;
    state.polling.testPlanKey = null;
    state.polling.startTime = null;

    ui.hideModal('pollingModal');
  },
};

// Event Handlers
const handlers = {
  /**
   * Load test plans
   */
  async loadTestPlans() {
    try {
      utils.showStatus('Loading test plans...');
      const result = await api.getTestPlans();
      state.testPlans = result.data;
      ui.renderTestPlans(state.testPlans);
      utils.showStatus('Test plans loaded', 'success');
    } catch (error) {
      console.error('Error loading test plans:', error);
      utils.showStatus('Failed to load test plans', 'error');
    }
  },

  /**
   * Start a test plan
   */
  async startTestPlan(key) {
    if (confirm(`Start test plan ${key}?\n\nThis will transition the issue to "In Arbeit" and trigger Jenkins.`)) {
      try {
        utils.showStatus(`Starting test plan ${key}...`);
        await api.startTestPlan(key);
        utils.showStatus(`Test plan ${key} started successfully!`, 'success');

        // Reload test plans to reflect status change
        await handlers.loadTestPlans();

        // Start polling for new execution
        state.currentTestPlan = key;
        await polling.start(key);
      } catch (error) {
        console.error('Error starting test plan:', error);
        utils.showStatus(`Failed to start test plan: ${error.message}`, 'error');
      }
    }
  },

  /**
   * View executions for a test plan
   */
  async viewExecutions(key) {
    try {
      utils.showStatus(`Loading executions for ${key}...`);
      const result = await api.getLatestTestExecution(key);

      if (!result.data) {
        utils.showStatus('No test executions found for this test plan', 'warning');
        return;
      }

      // Load execution details
      const detailsResult = await api.getExecutionDetails(result.data.key);
      state.currentExecution = detailsResult.data;
      state.currentTestPlan = key;

      ui.renderExecutionSummary(state.currentExecution);
      ui.renderTestCases(state.currentExecution.testCases, state.currentTab);
      ui.showExecutionSection();

      utils.showStatus('Execution loaded', 'success');
    } catch (error) {
      console.error('Error loading executions:', error);
      utils.showStatus('Failed to load executions', 'error');
    }
  },

  /**
   * Export failed tests
   */
  exportFailedTests() {
    if (!state.currentExecution) {
      return;
    }

    const failedTests = state.currentExecution.testCases.filter((tc) => {
      const status = tc.status?.toLowerCase() || '';
      return status === 'fail' || status === 'failed' || status === 'error';
    });

    if (failedTests.length === 0) {
      utils.showStatus('No failed tests to export', 'warning');
      return;
    }

    // Create export content
    const content = [
      `Test Execution: ${state.currentExecution.key}`,
      `Date: ${utils.formatDate(state.currentExecution.created)}`,
      `Total Failed: ${failedTests.length}`,
      '',
      'Failed Test Cases:',
      '==================',
      '',
      ...failedTests.map((tc) => {
        return [
          `ID: ${tc.id}`,
          `Name: ${tc.name}`,
          `Status: ${tc.status}`,
          tc.message ? `Message: ${tc.message}` : '',
          '---',
        ].filter(Boolean).join('\n');
      }),
    ].join('\n');

    const filename = `failed_tests_${state.currentExecution.key}_${Date.now()}.txt`;
    utils.downloadFile(content, filename);
    utils.showStatus('Failed tests exported', 'success');
  },

  /**
   * Copy failed test IDs
   */
  copyFailedIds() {
    if (!state.currentExecution) {
      return;
    }

    const failedTests = state.currentExecution.testCases.filter((tc) => {
      const status = tc.status?.toLowerCase() || '';
      return status === 'fail' || status === 'failed' || status === 'error';
    });

    if (failedTests.length === 0) {
      utils.showStatus('No failed tests to copy', 'warning');
      return;
    }

    const ids = failedTests.map((tc) => tc.id).join('\n');
    utils.copyToClipboard(ids);
  },

  /**
   * Add comment to execution
   */
  addComment() {
    if (!state.currentExecution) {
      return;
    }

    ui.showModal('commentModal');
    document.getElementById('commentText').value = 'Analysis in progress...';
  },

  /**
   * Submit comment
   */
  async submitComment() {
    const commentText = document.getElementById('commentText').value.trim();

    if (!commentText) {
      utils.showStatus('Please enter a comment', 'warning');
      return;
    }

    try {
      utils.showStatus('Adding comment to Jira...');
      await api.addComment(state.currentExecution.key, commentText);
      utils.showStatus('Comment added successfully', 'success');
      ui.hideModal('commentModal');
      document.getElementById('commentText').value = '';
    } catch (error) {
      console.error('Error adding comment:', error);
      utils.showStatus('Failed to add comment', 'error');
    }
  },

  /**
   * Switch tab
   */
  switchTab(tab) {
    state.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Re-render test cases with filter
    if (state.currentExecution) {
      ui.renderTestCases(state.currentExecution.testCases, tab);
    }
  },
};

// Initialize Application
async function init() {
  console.log('Initializing Jira Test Manager...');

  // Load configuration
  try {
    const configResult = await api.getConfig();
    state.config = configResult.data;
    console.log('Configuration loaded:', state.config);
  } catch (error) {
    console.error('Error loading configuration:', error);
    utils.showStatus('Failed to load configuration', 'error');
  }

  // Load test plans
  await handlers.loadTestPlans();

  // Event Listeners
  document.getElementById('refreshPlansBtn').addEventListener('click', handlers.loadTestPlans);

  document.getElementById('closeExecutionBtn').addEventListener('click', () => {
    ui.hideExecutionSection();
  });

  document.getElementById('exportFailedBtn').addEventListener('click', handlers.exportFailedTests);

  document.getElementById('copyFailedBtn').addEventListener('click', handlers.copyFailedIds);

  document.getElementById('addCommentBtn').addEventListener('click', handlers.addComment);

  document.getElementById('submitCommentBtn').addEventListener('click', handlers.submitComment);

  document.getElementById('cancelCommentBtn').addEventListener('click', () => {
    ui.hideModal('commentModal');
  });

  document.getElementById('stopPollingBtn').addEventListener('click', () => {
    polling.stop();
    utils.showStatus('Polling stopped', 'warning');
  });

  // Modal close button
  document.querySelectorAll('.close').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      modal.classList.remove('show');
    });
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      handlers.switchTab(tab);
    });
  });

  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('show');
    }
  });

  console.log('Jira Test Manager initialized successfully');
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
