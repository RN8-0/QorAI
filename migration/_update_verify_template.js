const PB = require('pocketbase/cjs');
const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync(__dirname + '/.env', 'utf8')
    .split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const newTpl = {
  subject: 'Verify your email — {APP_NAME}',
  body: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.6">
  <div style="text-align:center;margin-bottom:24px">
    <h1 style="font-size:22px;margin:0;color:#0f172a">{APP_NAME}</h1>
  </div>
  <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px">Confirm your email address</h2>
  <p style="margin:0 0 16px;color:#374151">Welcome to {APP_NAME}! Please confirm your email address to activate AI features on your account. This link is valid for 24 hours.</p>
  <p style="margin:0 0 16px;color:#374151"><strong>TR:</strong> {APP_NAME} ailesine hoş geldiniz! Hesabınızda AI özelliklerini aktifleştirmek için aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın. Bağlantı 24 saat geçerlidir.</p>
  <p style="text-align:center;margin:28px 0">
    <a href="{APP_URL}/email-verify?token={TOKEN}" style="display:inline-block;padding:14px 32px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">Verify Email / E-postayı Doğrula</a>
  </p>
  <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;word-break:break-all"><a href="{APP_URL}/email-verify?token={TOKEN}" style="color:#3b82f6;font-size:13px">{APP_URL}/email-verify?token={TOKEN}</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#9ca3af;font-size:12px;margin:0">If you did not create a {APP_NAME} account, you can safely ignore this email. / Bu hesabı siz oluşturmadıysanız bu maili güvenle silebilirsiniz.</p>
</div>`,
};

(async () => {
  const pb = new PB(env.POCKETBASE_URL);
  await pb.collection('_superusers').authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);
  await pb.collections.update('users', { verificationTemplate: newTpl });
  const after = await pb.collections.getOne('users');
  console.log('OK. New subject:', after.verificationTemplate.subject);
})().catch(e => {
  console.error('ERR:', e.message);
  if (e.response) console.error(JSON.stringify(e.response, null, 2));
  process.exit(1);
});
