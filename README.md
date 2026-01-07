# Jira Test Manager

A local web application for managing Jira-based test activities without using the Jira UI. Built for software testers to streamline test plan execution and failure analysis workflows.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Workflow](#workflow)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Overview

This application provides a streamlined interface for:

- Starting Jira Test Plans by changing their status to "In Arbeit"
- Automatically detecting new Test Executions (Testausführung) created by Jenkins
- Viewing test execution results and failed test cases
- Exporting failed test IDs for local reruns
- Adding comments and labels to test executions

**Important Constraints:**
- Runs ONLY locally (localhost)
- No cloud deployment
- Jenkins is NOT accessed or modified
- Only interacts with Jira REST API v2
- Requires active VPN connection to access Jira

## Features

### Core Functionality

✅ **Test Plan Management**
- View all configured test plans with current status
- Start test plans with one click (triggers Jenkins via Jira status change)
- View execution history for each test plan

✅ **Automatic Execution Detection**
- Polls Jira for new Test Executions after starting a test plan
- Configurable polling interval
- Visual feedback during polling process

✅ **Test Results Analysis**
- Display execution summary with PASS/FAIL/ERROR counts
- Filter tests by status (All, Failed, Passed)
- View detailed failure information including error messages

✅ **Export & Copy**
- Export failed tests to text file
- Copy failed test IDs to clipboard for local reruns

✅ **Jira Integration**
- Add comments to test executions
- Add labels to test executions
- All operations server-side (secure token handling)

## Architecture

```
┌─────────────┐
│   Browser   │  Frontend: HTML + CSS + JavaScript
│  (Frontend) │  - Test plan list UI
└──────┬──────┘  - Execution details view
       │          - Polling mechanism
       │ HTTP
       ▼
┌─────────────┐
│   Express   │  Backend: Node.js + Express
│   Server    │  - API endpoints
│  (Backend)  │  - Jira service wrapper
└──────┬──────┘  - Configuration management
       │
       │ Bearer Token (PAT)
       │ HTTPS
       ▼
┌─────────────┐
│  Jira REST  │  External: Jira Cloud/Server
│     API     │  - Test Plans
└─────────────┘  - Test Executions
```

## Prerequisites

- **Node.js**: v16 or higher
- **npm**: v8 or higher
- **VPN**: Active connection to access Jira instance
- **Jira Personal Access Token**: Required for authentication
- **Jira Test Plans**: Existing test plan issues in Jira

## Installation

1. **Clone or navigate to the project directory:**

```bash
cd /path/to/jira-test-manager
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create environment configuration:**

```bash
cp .env.example .env
```

4. **Edit `.env` file with your settings:**

```bash
# Use your preferred editor
nano .env
# or
vim .env
```

## Configuration

### Environment Variables

Edit the `.env` file with your specific configuration:

```env
# Jira Configuration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_PERSONAL_ACCESS_TOKEN=your_personal_access_token_here

# Jira Project Configuration
JIRA_PROJECT_KEY=PBT

# Test Plan Configuration (comma-separated list)
TEST_PLAN_KEYS=PBT-31929,PBT-31930,PBT-31931

# Application Configuration
PORT=3000
NODE_ENV=development

# Polling Configuration (in seconds)
POLL_INTERVAL=30
```

### Configuration Details

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | Yes | Your Jira instance URL (without trailing slash) |
| `JIRA_PERSONAL_ACCESS_TOKEN` | Yes | Jira Personal Access Token for authentication |
| `JIRA_PROJECT_KEY` | Yes | Jira project key (e.g., "PBT") |
| `TEST_PLAN_KEYS` | Yes | Comma-separated list of Test Plan issue keys |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment mode (development/production) |
| `POLL_INTERVAL` | No | Polling interval in seconds (default: 30) |

### Obtaining a Jira Personal Access Token

1. Log in to your Jira instance
2. Go to **Account Settings** → **Security** → **Personal Access Tokens**
3. Click **Create token**
4. Give it a name (e.g., "Local Test Manager")
5. Set appropriate permissions (read/write issues, add comments)
6. Copy the token immediately (it won't be shown again)
7. Paste it into your `.env` file

## Usage

### Starting the Application

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The application will start on `http://localhost:3000` (or your configured port).

### Using the Application

1. **View Test Plans**
   - Open `http://localhost:3000` in your browser
   - See all configured test plans with their current status

2. **Start a Test Plan**
   - Click "Start Test" on any test plan
   - Confirm the action
   - The app changes the Jira status to "In Arbeit"
   - Jenkins automatically starts running tests
   - Polling begins automatically

3. **Wait for Execution**
   - A modal shows polling progress
   - The app checks Jira every 30 seconds (configurable)
   - When a new Test Execution is detected, it's displayed automatically

4. **Analyze Results**
   - View execution summary (Total, Passed, Failed, Error counts)
   - Use tabs to filter tests (All / Failed / Passed)
   - Click through failed test details

5. **Export Failed Tests**
   - Click "Export Failed Tests" to download a text file
   - Click "Copy Failed IDs" to copy test IDs to clipboard
   - Use these IDs for local test reruns

6. **Add Jira Comments**
   - Click "Add Jira Comment"
   - Enter your comment (e.g., "Analysis in progress")
   - Submit to add the comment to the test execution in Jira

## API Documentation

### Test Plans

#### GET `/api/test-plans`
Get all configured test plans with their current status.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "key": "PBT-31929",
      "summary": "Test Plan for Feature X",
      "status": "To Do",
      "statusCategory": "new",
      "created": "2024-01-15T10:00:00.000Z",
      "updated": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

#### POST `/api/test-plans/:key/start`
Start a test plan by transitioning it to "In Arbeit".

**Response:**
```json
{
  "success": true,
  "message": "Test Plan PBT-31929 successfully transitioned to 'In Arbeit'"
}
```

#### GET `/api/test-plans/:key/executions/latest`
Get the latest test execution for a test plan.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "PBT-32001",
    "summary": "Test Execution for PBT-31929",
    "status": "Done",
    "created": "2024-01-15T11:30:00.000Z"
  }
}
```

### Test Executions

#### GET `/api/executions/:key`
Get detailed test execution results including all test cases.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "PBT-32001",
    "summary": "Test Execution for PBT-31929",
    "status": "Done",
    "created": "2024-01-15T11:30:00.000Z",
    "testCases": [
      {
        "id": "TEST-001",
        "name": "Login Test",
        "status": "PASS",
        "message": ""
      },
      {
        "id": "TEST-002",
        "name": "Checkout Test",
        "status": "FAIL",
        "message": "Payment gateway timeout"
      }
    ],
    "summary_stats": {
      "total": 50,
      "passed": 48,
      "failed": 1,
      "error": 1
    }
  }
}
```

#### GET `/api/executions/:key/failed-tests`
Get only the failed test cases from an execution.

#### POST `/api/executions/:key/comment`
Add a comment to a test execution.

**Request Body:**
```json
{
  "comment": "Analysis in progress..."
}
```

#### POST `/api/executions/:key/labels`
Add labels to a test execution.

**Request Body:**
```json
{
  "labels": ["needs-investigation", "high-priority"]
}
```

### Utility

#### GET `/api/config`
Get application configuration (sanitized, no tokens).

#### GET `/api/health`
Health check endpoint.

## Workflow

### Standard Test Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Tester opens local app                                    │
│    http://localhost:3000                                     │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Tester clicks "Start Test" on a Test Plan                │
│    App changes Jira status to "In Arbeit"                   │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Jenkins detects status change (automatic)                │
│    Starts test execution job                                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. App polls Jira every 30 seconds                          │
│    Waiting for new "Testausführung" issue                   │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Jenkins finishes tests                                   │
│    Creates new "Testausführung" issue in Jira              │
│    Links it to Test Plan via "Test Plan" custom field      │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. App detects new execution                                │
│    Automatically loads and displays results                 │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Tester analyzes failed tests                            │
│    Exports/copies failed test IDs                          │
│    Adds Jira comment                                       │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Tester runs failed tests locally                        │
│    Uses exported test IDs                                  │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Common Issues

#### 1. Cannot connect to Jira

**Error:** "Failed to fetch test plans"

**Solutions:**
- Check VPN connection is active
- Verify `JIRA_BASE_URL` in `.env` is correct
- Ensure Personal Access Token is valid
- Check network connectivity

#### 2. Test Plan not found

**Error:** "Issue PBT-XXXXX not found"

**Solutions:**
- Verify the test plan key exists in Jira
- Check you have read permissions for the issue
- Ensure the test plan key is correct in `.env`

#### 3. Cannot start test plan

**Error:** "Transition 'In Arbeit' not found"

**Solutions:**
- Check the test plan workflow allows this transition
- Verify current status allows transition to "In Arbeit"
- Issue may already be in "In Arbeit" status

#### 4. No test executions found

**Message:** "No test executions found"

**Reasons:**
- Jenkins hasn't created the execution yet (wait longer)
- Jenkins job failed (check Jenkins logs)
- Test Execution not linked correctly to Test Plan
- JQL query may need adjustment for your Jira setup

#### 5. Test results not parsing correctly

**Issue:** Empty test cases or incorrect counts

**Solutions:**
- Check the Jira custom field structure for test executions
- You may need to adjust `parseTestExecutionResults()` in `backend/services/jira.service.js`
- Look at the actual Jira issue structure and modify parsing logic accordingly

### Debug Mode

Enable debug logging by setting in `.env`:

```env
NODE_ENV=development
```

This will show detailed API requests and responses in the console.

### Checking Jira API Responses

You can manually test Jira API endpoints using curl:

```bash
# Test authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-jira.atlassian.net/rest/api/2/myself

# Get test plan
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-jira.atlassian.net/rest/api/2/issue/PBT-31929

# Search for test executions
curl -H "Authorization: Bearer YOUR_TOKEN" \
     "https://your-jira.atlassian.net/rest/api/2/search?jql=issuetype='Testausführung'+AND+'Test+Plan'=PBT-31929"
```

## Security Considerations

### Token Security

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Never commit `.env` file** - It contains sensitive tokens
2. **Token is server-side only** - Frontend never sees the token
3. **Use HTTPS in production** - If exposing beyond localhost
4. **Rotate tokens regularly** - Best practice for security
5. **Limit token permissions** - Only grant necessary permissions

### Network Security

- Application is designed for localhost only
- VPN required for Jira access
- No external exposure recommended
- All Jira requests go through backend

### Best Practices

1. Keep `.env` file permissions restricted:
   ```bash
   chmod 600 .env
   ```

2. Don't share your Personal Access Token

3. Use separate tokens for different environments

4. Regularly check Jira token usage logs

## Project Structure

```
jira-test-manager/
├── backend/
│   ├── server.js              # Express server entry point
│   ├── config/
│   │   └── jira.config.js     # Configuration loader
│   ├── services/
│   │   └── jira.service.js    # Jira API client
│   ├── routes/
│   │   └── api.routes.js      # API endpoint definitions
│   └── utils/
│       └── logger.js          # Logging utility
├── frontend/
│   ├── index.html             # Main UI
│   ├── css/
│   │   └── styles.css         # Application styles
│   └── js/
│       └── app.js             # Frontend logic & polling
├── .env                       # Environment config (not in git)
├── .env.example               # Template for .env
├── .gitignore                 # Git ignore rules
├── package.json               # Node.js dependencies
└── README.md                  # This file
```

## Technology Stack

**Backend:**
- Node.js v16+
- Express.js - Web framework
- Axios - HTTP client
- dotenv - Environment configuration

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5
- CSS3 (Grid, Flexbox)

**External:**
- Jira REST API v2

## Contributing

This is a local tool. Customize as needed for your workflow.

Key areas for customization:

1. **Jira Field Parsing** (`backend/services/jira.service.js`)
   - Adjust `parseTestExecutionResults()` for your Jira custom fields

2. **UI Styling** (`frontend/css/styles.css`)
   - Modify colors, layout to match your preferences

3. **Polling Interval** (`.env`)
   - Adjust `POLL_INTERVAL` based on typical Jenkins run time

4. **Status Names** (`backend/services/jira.service.js`)
   - Change "In Arbeit" to match your Jira workflow status names

## License

MIT License - Feel free to modify and use as needed.

## Support

For issues with:
- **Jira API**: Check Jira REST API documentation
- **Jenkins**: Contact Jenkins administrators
- **This application**: Review logs, check configuration, modify code as needed

---

**Built for testers, by developers who understand testing workflows.**
