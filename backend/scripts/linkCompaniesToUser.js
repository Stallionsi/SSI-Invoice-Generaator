/**
 * One-time fix: links all existing Company documents to a specified user.
 *
 * Usage:
 *   node backend/scripts/linkCompaniesToUser.js
 *   node backend/scripts/linkCompaniesToUser.js --email admin@example.com
 *
 * Without --email it targets the first admin user found in the database.
 * Safe to run multiple times ($addToSet never duplicates).
 */
require('dotenv').config();
const mongoose  = require('mongoose');
const Company   = require('../src/models/Company.model');
const User      = require('../src/models/User.model');
const { MONGO_URI } = require('../src/config/env');

const emailArg = (() => {
  const idx = process.argv.indexOf('--email');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI.replace(/\/\/.*@/, '//***@'));

  // Find target user
  const query = emailArg ? { email: emailArg.toLowerCase() } : { role: 'admin' };
  const user  = await User.findOne(query).select('_id email name role companies');
  if (!user) {
    console.error('User not found with query:', query);
    process.exit(1);
  }
  console.log(`\nTarget user : ${user.name} <${user.email}> [${user.role}]`);
  console.log(`Currently linked companies: ${(user.companies || []).length}`);

  // Fetch all companies
  const allCompanies = await Company.find().select('_id companyName shortCode isActive').lean();
  if (!allCompanies.length) {
    console.log('\nNo companies found in the database. Create companies first via POST /api/company.');
    process.exit(0);
  }

  console.log(`\nAll companies in DB (${allCompanies.length}):`);
  const linkedSet = new Set((user.companies || []).map(id => id.toString()));
  allCompanies.forEach(c => {
    const status = linkedSet.has(c._id.toString()) ? '✓ linked' : '  unlinked';
    console.log(`  [${status}]  ${c.companyName}  (${c.shortCode || 'no shortCode'})  _id: ${c._id}`);
  });

  const unlinked = allCompanies.filter(c => !linkedSet.has(c._id.toString()));
  if (!unlinked.length) {
    console.log('\nAll companies are already linked to this user. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Link all unlinked companies
  const idsToAdd = unlinked.map(c => c._id);
  await User.findByIdAndUpdate(user._id, {
    $addToSet: { companies: { $each: idsToAdd } },
  });

  console.log(`\nLinked ${idsToAdd.length} company/companies to ${user.email}:`);
  unlinked.forEach(c => console.log(`  + ${c.companyName}`));
  console.log('\nDone. Hard-refresh your browser to see the updated company list.');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
