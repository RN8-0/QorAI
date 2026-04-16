// Compair — ensure the admins auth collection exists and is configured for GitHub OAuth.
const { req } = require('./pb');

const GITHUB_CLIENT_ID = process.env.COMPAIR_ADMIN_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.COMPAIR_ADMIN_GITHUB_CLIENT_SECRET;

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.error('Set COMPAIR_ADMIN_GITHUB_CLIENT_ID and COMPAIR_ADMIN_GITHUB_CLIENT_SECRET.');
  process.exit(1);
}

function T(name, o = {}) {
  return {
    name,
    type: 'text',
    max: o.max || 255,
    min: o.min || 0,
    required: !!o.required,
    ...o,
  };
}

function U(name, o = {}) {
  return { name, type: 'url', required: !!o.required, ...o };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripFieldId(field) {
  const copy = clone(field);
  delete copy.id;
  return copy;
}

function buildAdminsCollection(usersCollection, preserveFieldIds = false) {
  const baseFields = usersCollection.fields
    .filter((field) =>
      [
        'id',
        'password',
        'tokenKey',
        'email',
        'emailVisibility',
        'verified',
        'name',
        'avatar',
        'created',
        'updated',
      ].includes(field.name),
    )
    .map((field) => (preserveFieldIds ? clone(field) : stripFieldId(field)));

  const customFields = [
    T('githubId'),
    T('githubUsername'),
    U('githubAvatarUrl'),
  ];

  return {
    name: 'admins',
    type: 'auth',
    system: false,
    listRule: 'id = @request.auth.id',
    viewRule: 'id = @request.auth.id',
    createRule: '',
    updateRule: 'id = @request.auth.id',
    deleteRule: 'id = @request.auth.id',
    authRule: '',
    manageRule: null,
    fields: [...baseFields, ...customFields],
    indexes: [
      'CREATE UNIQUE INDEX `idx_tokenKey_admins` ON `admins` (`tokenKey`)',
      'CREATE UNIQUE INDEX `idx_email_admins` ON `admins` (`email`) WHERE `email` != \'\'',
      'CREATE UNIQUE INDEX `idx_admins_github_username` ON `admins` (`githubUsername`) WHERE `githubUsername` != \'\'',
    ],
    oauth2: {
      enabled: true,
      mappedFields: {
        id: 'githubId',
        name: 'name',
        username: 'githubUsername',
        avatarURL: 'githubAvatarUrl',
      },
      providers: [
        {
          pkce: null,
          name: 'github',
          clientId: GITHUB_CLIENT_ID,
          clientSecret: GITHUB_CLIENT_SECRET,
          authURL: '',
          tokenURL: '',
          userInfoURL: '',
          displayName: 'GitHub',
          extra: null,
        },
      ],
    },
    passwordAuth: {
      enabled: false,
      identityFields: ['email'],
    },
    mfa: {
      enabled: false,
      duration: 1800,
      rule: '',
    },
    otp: {
      ...(clone(usersCollection.otp || {})),
      enabled: false,
    },
    authAlert: {
      ...(clone(usersCollection.authAlert || {})),
      enabled: false,
    },
    authToken: {
      duration: usersCollection.authToken?.duration || 604800,
    },
    passwordResetToken: {
      duration: usersCollection.passwordResetToken?.duration || 1800,
    },
    emailChangeToken: {
      duration: usersCollection.emailChangeToken?.duration || 1800,
    },
    verificationToken: {
      duration: usersCollection.verificationToken?.duration || 259200,
    },
    fileToken: {
      duration: usersCollection.fileToken?.duration || 180,
    },
    verificationTemplate: clone(usersCollection.verificationTemplate || {}),
    resetPasswordTemplate: clone(usersCollection.resetPasswordTemplate || {}),
    confirmEmailChangeTemplate: clone(usersCollection.confirmEmailChangeTemplate || {}),
  };
}

(async () => {
  console.log('=== Compair — admins auth setup ===\n');

  const users = await req('GET', '/api/collections/users');
  if (users.status !== 200) {
    console.error('Failed to load users collection:', users.status, users.body);
    process.exit(1);
  }

  const desired = buildAdminsCollection(users.body);
  const existing = await req('GET', '/api/collections/admins');

  if (existing.status === 200) {
    const existingFieldNames = new Set(existing.body.fields.map((field) => field.name));
    const customFields = desired.fields.filter(
      (field) => !existingFieldNames.has(field.name),
    );
    const patched = {
      listRule: desired.listRule,
      viewRule: desired.viewRule,
      createRule: desired.createRule,
      updateRule: desired.updateRule,
      deleteRule: desired.deleteRule,
      authRule: desired.authRule,
      manageRule: desired.manageRule,
      fields: [...existing.body.fields, ...customFields],
      indexes: desired.indexes,
      oauth2: desired.oauth2,
      passwordAuth: desired.passwordAuth,
      mfa: desired.mfa,
      otp: desired.otp,
      authAlert: desired.authAlert,
      authToken: desired.authToken,
      passwordResetToken: desired.passwordResetToken,
      emailChangeToken: desired.emailChangeToken,
      verificationToken: desired.verificationToken,
      fileToken: desired.fileToken,
      verificationTemplate: desired.verificationTemplate,
      resetPasswordTemplate: desired.resetPasswordTemplate,
      confirmEmailChangeTemplate: desired.confirmEmailChangeTemplate,
    };
    const result = await req('PATCH', `/api/collections/${existing.body.id}`, patched);
    if (result.status !== 200) {
      console.error('Failed to update admins collection:', result.status, result.body);
      process.exit(1);
    }
    console.log('[admins] updated');
    return;
  }

  if (existing.status !== 404) {
    console.error('Failed to inspect admins collection:', existing.status, existing.body);
    process.exit(1);
  }

  const created = await req('POST', '/api/collections', desired);
  if (created.status !== 200 && created.status !== 201) {
    console.error('Failed to create admins collection:', created.status, created.body);
    process.exit(1);
  }

  console.log('[admins] created');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
