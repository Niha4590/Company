#!/usr/bin/env node
/**
 * Seed Script: Create First Administrator
 * Usage: node scripts/seed-admin.js
 * 
 * Run AFTER running migrations in Supabase.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../src/config/supabase');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@company.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const fullName = process.env.ADMIN_NAME || 'System Administrator';

  console.log('\n🔧 Seeding admin account...');
  console.log(`   Email: ${email}`);
  console.log(`   Name:  ${fullName}`);

  // Get super_admin role
  const { data: role, error: roleErr } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', 'super_admin')
    .single();

  if (roleErr || !role) {
    console.error('❌ super_admin role not found. Run migrations first!');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .upsert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role_id: role.id,
      is_active: true,
    }, { onConflict: 'email' })
    .select()
    .single();

  if (userErr) {
    console.error('❌ Failed to create user:', userErr.message);
    process.exit(1);
  }

  // Create profile
  await supabaseAdmin.from('user_profiles').upsert({
    user_id: user.id,
    full_name: fullName,
  }, { onConflict: 'user_id' });

  console.log('\n✅ Admin account created successfully!');
  console.log(`   User ID: ${user.id}`);
  console.log(`   Login at http://localhost:5173/login`);
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log('\n⚠️  SECURITY: Change the default password immediately after first login!\n');

  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
