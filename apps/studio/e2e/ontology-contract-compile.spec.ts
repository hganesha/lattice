import { expect, test } from '@playwright/test'

test('creates a contract scoped to an industry ontology and opens its compiler', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')

  await page.getByLabel('Industry workspace').selectOption({ label: 'Energy Workspace' })
  await expect(page.getByRole('heading', { name: 'Shared ontology' })).toBeVisible()
  await page.getByRole('button', { name: /^Contracts/ }).click()
  await page.locator('.contracts-hero').getByRole('button', { name: /New context contract/ }).click()

  await page.getByLabel('Contract name').fill('Dispatch Prioritization E2E')
  await page.getByLabel('Purpose').fill('Prioritize governed field dispatch decisions during a grid disruption.')
  await page.getByLabel('Workflow').selectOption('field_dispatch')
  await page.getByLabel('Accountable owner').selectOption('Grid Operations')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Decision question').fill('Which grid assets should receive field service first?')
  await page.getByLabel('Expected answer shape').fill('A ranked list of grid assets with evidence and rationale.')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.locator('.concept-scope-picker input[type="checkbox"]:checked')).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Create contract →' }).click()

  await expect(page.getByRole('heading', { name: 'Choose a decision contract' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dispatch Prioritization E2E' })).toBeVisible()

  await page.getByRole('button', { name: 'Compiler' }).click()
  await expect(page.getByRole('heading', { name: 'Compiler', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish to compile ⌘↵' })).toBeDisabled()
})

test('compiles a published example from the first-run guide', async ({ page }) => {
  await page.goto('/')

  const guide = page.getByRole('dialog', { name: 'See the payoff before you author anything.' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: /Counterparty Risk & Exposure Assurance/ }).click()

  await expect(guide.getByText(/Compiler returned/)).toBeVisible()
  await guide.getByRole('button', { name: 'Open compiler →' }).click()

  await expect(page.getByRole('heading', { name: 'Compiler', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compile context ⌘↵' })).toBeEnabled()
})

test('does not leak governance data across industry workspaces', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')

  await page.getByLabel('Industry workspace').selectOption({ label: 'Real Estate Workspace' })
  await page.getByRole('button', { name: /^Policy profiles/ }).click()

  await expect(page.getByRole('heading', { name: 'Contracts', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Active contract')).toBeDisabled()
  await expect(page.getByLabel('Active contract')).toContainText('No contracts in this industry')
  await expect(page.getByText('Grid Outage Response')).toHaveCount(0)
  await expect(page.getByText('No contract', { exact: true })).toBeVisible()
})
