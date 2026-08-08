import { expect, test } from '@playwright/test'

test('autosaves a dirty draft without an explicit save', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lattice:welcome-dismissed', 'true'))
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/v1\/(contracts|workspaces)\//.test(request.url())) writes.push(request.url())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Shared ontology' })).toBeVisible()

  // Rename an entity type through the inspector: a normal edit, no Save click anywhere.
  const displayName = page.getByLabel('Display name').first()
  await displayName.fill('Counterparty Renamed')

  await expect(page.locator('.draft-state')).toHaveText(/saving shortly|Saving/i)
  await expect(page.locator('.draft-state')).toHaveText(/Draft saved/, { timeout: 15_000 })
  expect(writes.length).toBeGreaterThan(0)
})
