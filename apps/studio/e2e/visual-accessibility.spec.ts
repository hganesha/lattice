import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

type Theme = 'LIGHT' | 'DARK'

async function openOntology(page: Page, theme: Theme) {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('lattice:welcome-dismissed', 'true')
    localStorage.setItem('lattice:theme', selectedTheme)
    localStorage.setItem('lattice:text-scale', 'COMFORTABLE')
    localStorage.setItem('lattice:locale', 'en-US')
  }, { selectedTheme: theme })
  await page.goto('/')
  // Real Estate currently has the densest ontology and is the best layout regression fixture.
  await page.getByLabel('Industry workspace').selectOption({ label: 'Real Estate Workspace' })
  await expect(page.getByRole('heading', { name: 'Real Estate Ontology' })).toBeVisible()
  await expect(page.locator('.ontology-flow-node')).toHaveCount(16)
  await expect(page.locator('.ontology-lane-node')).toHaveCount(7)
  await expect(page.getByText('Runtime healthy')).toBeVisible()
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; caret-color: transparent !important; transition: none !important; } .sidebar-footer div span { visibility: hidden !important; }' })
}

for (const theme of ['LIGHT', 'DARK'] as const) {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'ultrawide', width: 2560, height: 1440 },
  ]) {
    test(`${theme.toLocaleLowerCase()} ontology at ${viewport.name} width`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openOntology(page, theme)

      await expect(page).toHaveScreenshot(`ontology-${theme.toLocaleLowerCase()}-${viewport.name}.png`, {
        animations: 'disabled',
        fullPage: true,
        // Chromium can rasterize React Flow's SVG edge labels a fraction of a pixel differently between processes.
        maxDiffPixelRatio: 0.002,
      })
    })
  }
}

test('ontology authoring has no serious WCAG A or AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openOntology(page, 'LIGHT')

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blockingViolations = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.flatMap((node) => node.target) }))

  expect(blockingViolations).toEqual([])
})

test('auto-layout toggles manual movement and authoring opens in a side drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openOntology(page, 'DARK')

  const layoutToggle = page.getByRole('button', { name: 'Auto-layout ON' })
  await expect(layoutToggle).toHaveAttribute('aria-pressed', 'true')
  await layoutToggle.click()
  await expect(page.getByRole('button', { name: 'Auto-layout OFF' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Auto-layout OFF' }).click()
  await expect(page.locator('.studio-toast')).toContainText('Applied semantic lanes with collision-free spacing')

  await page.getByRole('button', { name: '＋ Entity type' }).click()
  const entityDrawer = page.getByRole('complementary', { name: 'Create entity type' })
  await expect(entityDrawer).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Create entity type' })).toHaveCount(0)

  await entityDrawer.getByLabel('Display name').fill('Lease Charge')
  await entityDrawer.getByLabel('Description').fill('A governed charge assessed under a lease.')
  await entityDrawer.getByLabel('Domain group').selectOption('Property')
  await entityDrawer.getByLabel('Icon').fill('LC')
  await entityDrawer.getByRole('button', { name: 'Create type' }).click()

  await expect(page.locator('.ontology-flow-node')).toHaveCount(17)
  await expect(page.locator('.ontology-lane-node')).toHaveCount(7)
  const propertyLane = page.locator('.ontology-lane-node').filter({ hasText: 'Property' })
  const newNode = page.locator('.ontology-flow-node').filter({ hasText: 'Lease Charge' })
  await expect(propertyLane).toContainText('2')
  await expect.poll(async () => {
    const laneBox = await propertyLane.boundingBox()
    const nodeBox = await newNode.boundingBox()
    return Boolean(laneBox && nodeBox
      && nodeBox.x >= laneBox.x
      && nodeBox.y >= laneBox.y
      && nodeBox.x + nodeBox.width <= laneBox.x + laneBox.width
      && nodeBox.y + nodeBox.height <= laneBox.y + laneBox.height)
  }).toBe(true)
})
