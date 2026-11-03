import { expect, type Locator, type Page } from '@playwright/test';

export const discardPrompt = (page: Page): Locator => page.getByRole('alertdialog', { name: 'Osparade ändringar', exact: true });

// Utlöser frågan med action och svarar i appens dialog. Dialogen ska vara stängd efteråt.
export async function answerConfirm(page: Page, title: string, label: string, action: () => Promise<unknown>) {
  await action();
  const prompt = page.getByRole('alertdialog', { name: title, exact: true });
  await prompt.getByRole('button', { name: label, exact: true }).click();
  await expect(prompt).toHaveCount(0);
}

export async function answerDiscard(page: Page, accept: boolean, action: () => Promise<unknown>) {
  await answerConfirm(page, 'Osparade ändringar', accept ? 'Lämna ändringarna' : 'Stanna kvar', action);
}

// För sviter där frågan kan dyka upp var som helst. Med seen kan provet kräva att ingen fråga visades.
export async function autoAnswerDiscard(page: Page, accept: boolean, seen?: string[]) {
  await page.addLocatorHandler(discardPrompt(page), async prompt => {
    seen?.push('discard');
    await prompt.getByRole('button', { name: accept ? 'Lämna ändringarna' : 'Stanna kvar', exact: true }).click();
  });
}
