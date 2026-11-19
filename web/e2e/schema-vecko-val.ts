import { expect, type Page } from '@playwright/test';

export const veckoval = (page: Page) => page.getByRole('combobox', { name: 'Visa schema för', exact: true });

export async function valjVeckoresurs(page: Page, namn: string, typ: string, keyboard = false) {
  const val = veckoval(page);
  await val.fill(namn);
  const option = page.getByRole('option', { name: `${namn} ${typ.toLocaleLowerCase('sv-SE')}`, exact: true });
  await expect(option).toBeVisible();
  if (keyboard) {
    for (let i = 0, count = await page.getByRole('option').count(); i < count && await option.getAttribute('data-highlighted') === null; i++) await val.press('ArrowDown');
    await expect(option).toHaveAttribute('data-highlighted', '');
    await val.press('Enter');
  } else await option.click();
  await expect(val).toHaveValue(`${namn} · ${typ}`);
}
