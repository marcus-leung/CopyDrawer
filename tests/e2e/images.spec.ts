import { test, expect } from './fixtures';

test('pasting an image saves it with a thumbnail and opens its detail', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 80);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2457C5';
    ctx.fillRect(0, 0, 120, 80);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(new File([blob], 'chart.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  });

  const list = page.getByRole('list', { name: 'Clips' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('chart.png');

  await list.getByRole('button', { name: /chart\.png/ }).click();
  await expect(page.getByRole('img', { name: 'chart.png' })).toBeVisible();
  await expect(page.getByText('PNG, 120 × 80')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'chart.png');
});
