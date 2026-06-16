import { expect, test } from '@playwright/test';

const user = {
  id: '33333333-3333-4333-8333-333333333333',
  username: 'smoke-user',
  level: 'B2',
  german_variant: 'de-DE',
  created_at: '2026-01-01T00:00:00Z',
};

const topics = [
  {
    id: 'housing',
    category: 'Daily life',
    title: 'Wohnungssuche',
    description: 'Talk about finding an apartment.',
    conversation_starters: [
      {
        id: 'starter-1',
        title: 'Start',
        prompt: 'Ich suche eine Wohnung.',
      },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: user.id, email: 'smoke@example.test', profile: user }),
  }));
  await page.route('**/auth/profile', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(user),
  }));
  await page.route('**/sessions/topics', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(topics),
  }));
  await page.route('**/sessions/free-conversation-topics', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/sessions/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/errors/me**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/exercises/me**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/flashcards/sets**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/resources**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
});

test('authenticated user can load the app shell and navigate core pages', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('german_auth_token', 'test-token');
  });

  await page.goto('/');

  await expect(page.getByText('My German Tutor').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Conversation/ })).toBeVisible();

  await page.getByRole('link', { name: /Exercises/ }).click();
  await expect(page).toHaveURL(/\/exercises$/);

  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('link', { name: /Ask teacher/ }).click();
  await expect(page).toHaveURL(/\/teacher$/);
});

test('guest can sign in through the home page', async ({ page }) => {
  await page.route('**/auth/sign-in', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'refresh-token',
      expires_at: 4_102_444_800,
      token_type: 'bearer',
      profile: user,
    }),
  }));

  await page.goto('/');
  await page.getByPlaceholder('Email').fill('smoke@example.test');
  await page.getByPlaceholder('Password').fill('secret123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('link', { name: /Conversation/ })).toBeVisible();
});
