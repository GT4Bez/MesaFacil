import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  screenshotOnRunFailure: false,
  e2e: {
    baseUrl: process.env.E2E_BASE_URL || 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    defaultCommandTimeout: 8000,
    retries: {
      runMode: process.env.CI ? 2 : 0,
      openMode: 0,
    },
  },
})
