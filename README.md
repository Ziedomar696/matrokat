# متابعة المتروكات — مراسي

App link: **https://ziedomar696.github.io/matrokat/**

- `apps-script/`: the Google Apps Script project (Code.gs, Index.html, appsscript.json).
  Data goes to the Google Sheet **متابعة المتروكات**; photos go to two private Drive folders.
- `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`: the installable app (GitHub Pages).
  `APP_URL` in `index.html` points at the Apps Script `/exec` link.

Roles: فرد الأمن, المشرف, المشرف العام, مدير شركة الأمن, مشرف أمن إعمار, المكتب الرئيسي.
Workflow: guard records → supervisor approves (= final match) or rejects → periodic patrol (موجود / مفقود / تالف).

Updating: paste the new Code.gs / Index.html into the Apps Script project (keep your `SETUP_CODE`),
then Deploy → Manage deployments → ✏️ → New version.
