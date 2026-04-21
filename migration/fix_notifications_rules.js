// Fix notifications collection access rules
// listRule/viewRule: users can only see their own notifications
// createRule: null (admin only — admins/system create notifications)
// updateRule: users can mark their own notifications as read
// deleteRule: users can delete their own notifications

const { req, auth } = require('./pb');

async function fixNotificationsRules() {
  await auth();

  // Get the notifications collection
  const col = await req('GET', '/api/collections/notifications');
  console.log('Current rules:', {
    listRule: col.listRule,
    viewRule: col.viewRule,
    createRule: col.createRule,
    updateRule: col.updateRule,
    deleteRule: col.deleteRule,
  });

  const recipientRule = 'recipientId = @request.auth.id';

  await req('PATCH', `/api/collections/${col.id}`, {
    listRule: recipientRule,
    viewRule: recipientRule,
    createRule: null,           // only admins/superusers can create
    updateRule: recipientRule,  // users can mark as read
    deleteRule: recipientRule,  // users can delete their own
  });

  console.log('✅ notifications collection rules updated!');
  console.log('  listRule:', recipientRule);
  console.log('  viewRule:', recipientRule);
  console.log('  createRule: null (admin only)');
  console.log('  updateRule:', recipientRule);
  console.log('  deleteRule:', recipientRule);
}

fixNotificationsRules().catch(e => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
