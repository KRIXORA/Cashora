export function template() {
  return `
<section class="page-section" id="settings">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">System Preferences</h2>
      <p class="page-section__subtitle">Account, sample data, import/export, and reset.</p>
    </div>
  </div>

  <div class="grid-two">
    <div class="card" style="display:flex; flex-direction:column; gap:var(--space-4);">
      <div class="card__header"><span class="card__title">Profile</span></div>
      <div class="field">
        <label class="field__label" for="settingsNameInput">Full Name</label>
        <input class="input" type="text" id="settingsNameInput" placeholder="Your name" autocomplete="name">
      </div>
      <div class="field">
        <label class="field__label" for="settingsEmailInput">Email Address</label>
        <input class="input" type="email" id="settingsEmailInput" placeholder="you@example.com" autocomplete="email">
        <p style="font-size:var(--text-xs); color:var(--color-text-muted); margin-top:var(--space-1)">Changing email sends a confirmation link to the new address.</p>
      </div>
      <div style="display:flex; gap:var(--space-3); flex-wrap:wrap">
        <button class="btn btn-primary" id="saveProfileBtn">Save Changes</button>
        <button class="btn btn-danger-outline" id="logoutBtn">Log Out</button>
      </div>
    </div>

    <div class="card" style="display:flex; flex-direction:column; gap:var(--space-4);">
      <div class="card__header"><span class="card__title">Sample data &amp; reset</span></div>
      <p style="font-size:var(--text-sm); color:var(--color-text-secondary); line-height:1.5">
        New here? Load sample data to explore charts, budgets, and net worth.
        Ready for real numbers? Reset clears everything so you can start fresh.
      </p>
      <div class="settings-actions">
        <button type="button" class="btn btn-primary" data-action="load-demo">
          Load sample data
        </button>
        <button type="button" class="btn btn-secondary" data-action="reset-and-demo">
          Reset &amp; load sample
        </button>
        <button type="button" class="btn btn-danger-outline" data-action="reset-all">
          Reset all data
        </button>
      </div>
      <p id="dataActionStatus" class="settings-status" role="status"></p>
      <p style="font-size:var(--text-xs); color:var(--color-text-muted)">
        <strong>Load sample</strong> works on empty accounts only.
        <strong>Reset &amp; load sample</strong> deletes your current data, then fills demo numbers.
        <strong>Reset all</strong> only deletes — leaves a blank workspace.
      </p>
    </div>
  </div>

  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-4);">
    <div class="card__header"><span class="card__title">Import / export</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">CSV needs columns: Date, Title, Category, Type, Amount (Notes optional). JSON is a full backup of this account.</p>
    <div class="settings-actions">
      <button class="btn btn-secondary" data-action="export-csv">Export CSV</button>
      <button class="btn btn-secondary" data-action="export-json">Full backup (JSON)</button>
      <label class="btn btn-primary" style="cursor:pointer; margin:0;">
        Import CSV
        <input type="file" id="csvImportInput" accept=".csv,text/csv" hidden>
      </label>
    </div>
    <p id="importStatus" style="font-size:var(--text-xs); color:var(--color-text-muted)"></p>
  </div>

  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-3);">
    <div class="card__header"><span class="card__title">Categories</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">Built-in categories stay fixed. Add custom ones for the transaction form. Removing only drops them from the picker (past transactions keep their label).</p>
    <div id="categoryManagerList" class="cat-manager-list"></div>
    <div class="cat-manager-add">
      <input class="input" type="text" id="newCategoryInput" placeholder="New category name" maxlength="40" autocomplete="off">
      <button type="button" class="btn btn-primary btn-sm" id="addCategoryBtn">Add category</button>
    </div>
  </div>


  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-3);">
    <div class="card__header"><span class="card__title">Security · MFA</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">Protect your account with an authenticator app (Google Authenticator, Authy, 1Password). Requires MFA enabled in your Supabase project.</p>
    <p id="mfaStatus" class="settings-status">Checking…</p>
    <div id="mfaEnrollBox" style="display:none; flex-direction:column; gap:var(--space-3);">
      <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">Scan this QR in your authenticator, then enter the 6-digit code.</p>
      <img id="mfaQr" alt="MFA QR code" style="width:180px; height:180px; background:#fff; border-radius:8px; padding:8px;">
      <input class="input" id="mfaVerifyCode" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code">
      <button type="button" class="btn btn-primary btn-sm" id="mfaVerifyBtn">Verify &amp; enable</button>
    </div>
    <div class="settings-actions">
      <button type="button" class="btn btn-secondary btn-sm" id="mfaEnrollBtn">Set up authenticator</button>
      <button type="button" class="btn btn-danger-outline btn-sm" id="mfaUnenrollBtn" style="display:none">Remove MFA</button>
    </div>
    <p id="mfaMsg" class="settings-status" role="status"></p>
  </div>

  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-3);">
    <div class="card__header"><span class="card__title">Install app</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">Install Cashora on your phone or computer for a full-screen app experience. After install, the bottom banner will not show again.</p>
    <div class="settings-actions">
      <button type="button" class="btn btn-primary btn-sm" id="settingsInstallBtn">Install app</button>
    </div>
    <p id="installSettingsStatus" class="settings-status" style="font-size:var(--text-xs); color:var(--color-text-muted)">You can also use the browser menu: Install app / Add to Home Screen.</p>
  </div>

  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-3);">
    <div class="card__header"><span class="card__title">Reminders</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary)">In-app reminders show bills due within 7 days and budget warnings. Optional browser notifications when the app is open.</p>
    <div class="settings-actions">
      <button type="button" class="btn btn-secondary btn-sm" id="enableBrowserNotifBtn">Enable browser notifications</button>
    </div>
    <p id="notifPermissionStatus" class="settings-status"></p>
  </div>

  <div class="card" style="margin-top:var(--space-5); display:flex; flex-direction:column; gap:var(--space-3);">
    <div class="card__header"><span class="card__title">Privacy &amp; your data</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary); line-height:1.55">
      Cashora stores your finance data in <strong>your</strong> Supabase project under Row Level Security — only your logged-in user can read it.
      We don’t sell data. Demo numbers are optional. You can export or wipe data anytime.
    </p>
    <ul style="font-size:var(--text-sm); color:var(--color-text-secondary); padding-left:1.2rem; line-height:1.6">
      <li>Export CSV or full JSON backup from Import / export above</li>
      <li>Reset all data clears transactions, budgets, goals, accounts, debts</li>
      <li>To delete the account itself, remove the user in Supabase Auth (or contact your project admin)</li>
    </ul>
    <div class="settings-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-action="export-json">Download my data (JSON)</button>
      <button type="button" class="btn btn-danger-outline btn-sm" data-action="reset-all">Wipe finance data</button>
    </div>
  </div>

  <div class="card" style="margin-top:var(--space-5);">
    <div class="card__header"><span class="card__title">Recurring Transactions</span></div>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary); margin-bottom:var(--space-3);">Set up a repeat when adding a transaction. Manage active rules here.</p>
    <div id="recurringList"></div>
  </div>
</section>`;
}
