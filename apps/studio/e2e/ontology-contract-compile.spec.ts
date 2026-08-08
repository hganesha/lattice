import { expect, test, type Page } from '@playwright/test'

/** The summary cards are click-through buttons now, so nav lookups must be scoped (E23). */
function nav(page: Page) {
  return page.getByRole('navigation')
}

/**
 * Navigation is an accordion: only the group holding the current surface is
 * expanded, so reaching another job's surface means opening its group first.
 * This mirrors what a user does rather than reaching into hidden markup.
 */
async function gotoSurface(page: Page, group: 'Build' | 'Operate' | 'Govern' | 'Assure', name: string | RegExp) {
  const toggle = nav(page).getByRole('button', { name: new RegExp(`^${group}`) })
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
  await nav(page).getByRole('button', { name }).click()
}

test('creates a contract scoped to an industry ontology and opens its compiler', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')

  await page.getByLabel('Industry workspace').selectOption({ label: 'Energy Workspace' })
  await expect(page.getByRole('heading', { name: 'Shared ontology' })).toBeVisible()
  await nav(page).getByRole('button', { name: /^Contracts/ }).click()
  await page.locator('.surface-hero').getByRole('button', { name: /New context contract/ }).click()

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
  await expect(page.getByRole('heading', { name: 'Dispatch Prioritization E2E', exact: true, level: 3 })).toBeVisible()

  await gotoSurface(page, 'Operate', 'Compiler')
  await expect(page.getByRole('heading', { name: 'Compiler', level: 1 })).toBeVisible()

  // E3: an unpublished contract reaches the money moment via dry run. A brand-new contract
  // declares no purposes yet, so the selector says so and does not block the compile.
  await expect(page.getByLabel('Declared purpose')).toBeDisabled()
  await expect(page.getByText(/This contract declares no purposes, so none can be named/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dry-run compile ⌘↵' })).toBeEnabled()
})

test('a dry run reaches a disposition without publishing anything', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')
  await gotoSurface(page, 'Operate', 'Compiler')

  // The seeded counterparty contract declares its purposes, so one must be named.
  await page.getByLabel('Declared purpose').selectOption('internal_analysis')
  await expect(page.getByText('Derived from purpose × contract × operation.')).toBeVisible()
  await page.getByRole('button', { name: 'Dry-run compile ⌘↵' }).click()

  // A dry-run result must read unmistakably as non-authorizing (E3).
  await expect(page.getByText('Dry run — this result authorizes nothing')).toBeVisible()
  await page.getByRole('button', { name: 'Open disposition' }).click()

  // Every compile persists, and the record is addressable by URL (E5, fixes G1/G2).
  await expect(page).toHaveURL(/\/dispositions\/disp_/)
  await expect(page.getByText('VERSION PINS').first()).toBeVisible()
  await expect(page.getByText('Dry run — non-authorizing')).toBeVisible()
})

test('compiles a published example from the first-run guide', async ({ page }) => {
  await page.goto('/')

  const guide = page.getByRole('dialog', { name: 'See the payoff before you author anything.' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: /Counterparty Risk & Exposure Assurance/ }).click()

  await expect(guide.getByText(/Compiler returned/)).toBeVisible()
  await guide.getByRole('button', { name: 'Open compiler →' }).click()

  await expect(page.getByRole('heading', { name: 'Compiler', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Authorized' }).click()
  await page.getByLabel('Declared purpose').selectOption('situational_awareness')
  await expect(page.getByRole('button', { name: 'Compile context ⌘↵' })).toBeEnabled()
})

test('does not leak governance data across industry workspaces', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')

  await page.getByLabel('Industry workspace').selectOption({ label: 'Real Estate Workspace' })
  await gotoSurface(page, 'Govern', /^Policy profiles/)

  // E2 replaces the silent redirect (G8): the surface stays put and names the prerequisite.
  await expect(page.getByRole('heading', { name: 'Policy profiles', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This surface needs a decision contract' })).toBeVisible()
  await expect(page.getByText(/Policy profiles set the evidence and approval thresholds/)).toBeVisible()
  await expect(page.getByText('Grid Outage Response')).toHaveCount(0)
})

test('task-shaped navigation exposes all three loops', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  await page.goto('/')

  for (const group of ['Build', 'Operate', 'Govern', 'Assure']) {
    await expect(nav(page).getByText(group, { exact: true })).toBeVisible()
  }
  await gotoSurface(page, 'Operate', /^Disposition trail/)
  await expect(page).toHaveURL(/\/dispositions$/)
  await gotoSurface(page, 'Assure', /^Case sets/)
  await expect(page).toHaveURL(/\/case-sets$/)
  await expect(page.getByRole('heading', { name: 'Case sets', level: 2 })).toBeVisible()
})
