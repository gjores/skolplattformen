import { expect, type Page } from '@playwright/test';

// Administrative roles now choose an explicit task after signing in.
// Direct links and roles that open the register immediately retain their route.
export async function openPupilsFromStart(page: Page) {
  await expect(page.locator('.protected-topbar')).toBeVisible();
  const task = page.locator('.workspace-start').getByRole('button', { name: /Hitta en elev/ });
  if (await task.isVisible()) await task.click();
}
