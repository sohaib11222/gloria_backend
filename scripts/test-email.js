#!/usr/bin/env node
/**
 * Test email configuration
 * Usage: node scripts/test-email.js
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
dotenv.config({ path: resolve(__dirname, '../.env') });

const emailHost = process.env.EMAIL_HOST;
const emailPort = parseInt(process.env.EMAIL_PORT || '587', 10);
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailSecure = process.env.EMAIL_SECURE === 'true';
const emailService = process.env.EMAIL_SERVICE;
const emailFrom = process.env.EMAIL_FROM || emailUser;

console.log('\n' + '='.repeat(80));
console.log('📧 EMAIL CONFIGURATION TEST');
console.log('='.repeat(80));
console.log(`Service: ${emailService || 'SMTP'}`);
console.log(`Host: ${emailHost || 'NOT SET'}`);
console.log(`Port: ${emailPort}`);
console.log(`Secure: ${emailSecure}`);
console.log(`User: ${emailUser ? emailUser.substring(0, 10) + '...' : 'NOT SET'}`);
console.log(`Password: ${emailPass ? 'SET' : 'NOT SET'}`);
console.log(`From: ${emailFrom || 'NOT SET'}`);
console.log('='.repeat(80) + '\n');

if (!emailHost || !emailUser || !emailPass) {
  console.error('❌ Missing required email configuration!');
  console.error('   Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in .env');
  process.exit(1);
}

// Create transporter
let transporter;
if (emailService === 'sendgrid') {
  console.log('📧 Using SendGrid SMTP...');
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: emailPass,
    },
  });
} else {
  transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailSecure,
    requireTLS: !emailSecure,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
}

// Test connection
console.log('🔍 Testing SMTP connection...\n');
transporter.verify()
  .then(() => {
    console.log('✅ SMTP Connection: SUCCESS\n');
    
    // Try sending a test email
    const testEmail = process.argv[2] || emailUser;
    console.log(`📧 Sending test email to: ${testEmail}`);
    console.log('   (If no email address provided, sending to configured user)\n');
    
    return transporter.sendMail({
      from: emailFrom,
      to: testEmail,
      subject: 'Test Email - GloriaConnect',
      html: `
        <h2>Email Test Successful!</h2>
        <p>If you received this email, your email configuration is working correctly.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
    });
  })
  .then((info) => {
    console.log('✅ Test Email Sent Successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response || 'N/A'}`);
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS PASSED - Email is working!');
    console.log('='.repeat(80) + '\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ EMAIL TEST FAILED\n');
    console.error(`Error Code: ${error.code || 'N/A'}`);
    console.error(`Error Message: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      console.error('\n🚨 FIREWALL BLOCKING DETECTED');
      console.error('   Solution: Use SendGrid or open firewall ports');
      console.error('   See: /var/www/gloriaconnect/backend/QUICK_EMAIL_FIX.md');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.error('\n🔐 AUTHENTICATION ERROR');
      console.error('   Check your EMAIL_USER and EMAIL_PASS');
      console.error('   For Gmail: Use App Password from https://myaccount.google.com/apppasswords');
    }
    
    console.error('\n' + '='.repeat(80) + '\n');
    process.exit(1);
  });
