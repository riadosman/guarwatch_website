// Playwright screenshot tour of the GuardWatch website
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  async function shot(name) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    console.log(`screenshot: ${name}`);
  }

  // 1. Landing page
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await shot('01_landing');

  // 2. Try navigating to /dashboard without login — should redirect to /login
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await shot('02_redirect_to_login');

  // 3. Login page
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await shot('03_login_page');

  // 4. Try wrong password
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'wrong');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  await shot('04_login_wrong_password');

  // 5. Login with correct credentials
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'changeme');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 8000 });
  await page.waitForTimeout(1500);
  await shot('05_dashboard_after_login');

  // 6. Simulate an event to have something on the dashboard
  try {
    await fetch('http://localhost:8000/api/dev/simulate-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'UYUYOR' }),
    });
    await page.waitForTimeout(2000);
    await shot('06_dashboard_with_event');
  } catch (e) { console.log('simulate event failed:', e.message); }

  // 7. Devices page
  await page.goto('http://localhost:3000/dashboard/devices', { waitUntil: 'networkidle' });
  await shot('07_devices_page');

  // 8. Add a device
  await page.click('text=Cihaz Ekle');
  await page.waitForTimeout(500);
  await page.fill('input[placeholder*="Cihaz"]', 'Test-Kule');
  await shot('08_add_device_form');
  await page.click('text=Oluştur');
  await page.waitForTimeout(1500);
  await shot('09_device_token_reveal');

  // 9. Close token dialog
  await page.click('text=Kapat');
  await page.waitForTimeout(500);

  // 10. Webhook section — scroll down
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await shot('10_webhooks_section');

  // 11. Add a webhook
  await page.click('text=Webhook Ekle');
  await page.waitForTimeout(500);
  await page.fill('input[placeholder*="İsim"]', 'Slack Alert');
  await page.fill('input[type="url"]', 'https://hooks.slack.com/test');
  await shot('11_webhook_form');
  await page.click('text=Kaydet');
  await page.waitForTimeout(1500);
  await shot('12_webhook_created');

  // 12. History page
  await page.goto('http://localhost:3000/dashboard/history', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('13_history_page');

  // 13. Logout
  await page.click('text=Çıkış');
  await page.waitForURL('**/login', { timeout: 5000 });
  await shot('14_after_logout');

  await browser.close();
  console.log('Done. Screenshots in:', OUT);
})();
