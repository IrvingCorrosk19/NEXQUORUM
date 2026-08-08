// Reference-only Node-style Playwright config for EO-001.
// The .NET suite configures the same values in ApiSession / env vars — see README.md.
module.exports = {
  use: {
    baseURL: process.env.ASAMBLEAS_BASE_URL || 'https://localhost:7188',
    ignoreHTTPSErrors: process.env.ASAMBLEAS_E2E_STRICT_TLS !== 'true',
  },
  projects: [
    { name: 'AutomatedMeeting' },
    { name: 'Manual', testMatch: /LiveKit/ },
  ],
};
