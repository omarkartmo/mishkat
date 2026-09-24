import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';

let app: Express;
let adminToken: string;
let studentToken: string;
const TEST_ADMIN_REG = 'ADM-TEST-RECOV';
const TEST_STUDENT_REG = 'STU-TEST-RECOV';
const INITIAL_ADMIN_PASS = 'AdminPass123!';
const INITIAL_STUDENT_PASS = 'StudentPass123!';

beforeAll(async () => {
  app = await createExpressApp();

  // Create clean test admin and student directly in DB
  const adminPassHash = await bcrypt.hash(INITIAL_ADMIN_PASS, 10);
  const studentPassHash = await bcrypt.hash(INITIAL_STUDENT_PASS, 10);

  await db.query(`
    INSERT INTO users (id, registration_number, name, role_id, password_hash, is_active)
    VALUES ($1, $2, $3, 'admin', $4, true)
    ON CONFLICT (registration_number) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  `, ['user-test-admin-recov', TEST_ADMIN_REG, 'مدير الاختبار الأولي', adminPassHash]);

  await db.query(`
    INSERT INTO users (id, registration_number, name, role_id, password_hash, is_active)
    VALUES ($1, $2, $3, 'student', $4, true)
    ON CONFLICT (registration_number) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  `, ['user-test-student-recov', TEST_STUDENT_REG, 'طالب الاختبار الأولي', studentPassHash]);

  // Log in as admin
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: TEST_ADMIN_REG, password: INITIAL_ADMIN_PASS });
  adminToken = adminLogin.body.data.token;

  // Log in as student
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: TEST_STUDENT_REG, password: INITIAL_STUDENT_PASS });
  studentToken = studentLogin.body.data.token;
});

afterAll(async () => {
  // Clean up test users
  await db.query("DELETE FROM users WHERE registration_number IN ($1, $2, 'ADM-TEST-RENAMED')", [
    TEST_ADMIN_REG,
    TEST_STUDENT_REG,
  ]);
  await db.close();
});

describe('Feature 1: Admin Initial Registration Information Editing', () => {
  it('rejects update if current password is wrong or missing', async () => {
    const res = await request(app)
      .put('/api/v1/users/admin/security')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currentPassword: 'WrongPassword!',
        name: 'اسم جديد',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('allows admin to update their initial registration number, name, username, and security question', async () => {
    const res = await request(app)
      .put('/api/v1/users/admin/security')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currentPassword: INITIAL_ADMIN_PASS,
        registrationNumber: 'ADM-TEST-RENAMED',
        name: 'أ. عمر المعدل',
        username: 'omar_super_admin',
        securityQuestion: 'ما هي مدينتك المفضلة؟',
        securityAnswer: 'نزوى',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.registrationNumber).toBe('ADM-TEST-RENAMED');
    expect(res.body.data.user.name).toBe('أ. عمر المعدل');
    expect(res.body.data.user.username).toBe('omar_super_admin');

    // Verify login with NEW registration number works
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'ADM-TEST-RENAMED', password: INITIAL_ADMIN_PASS });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.name).toBe('أ. عمر المعدل');
  });

  it('rejects duplicate registration numbers', async () => {
    const res = await request(app)
      .put('/api/v1/users/admin/security')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currentPassword: INITIAL_ADMIN_PASS,
        registrationNumber: TEST_STUDENT_REG, // Already used by student!
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('Feature 2: Student Security Question Setup & Remote Password Recovery', () => {
  it('allows student to set their security question and answer via PUT /my-security', async () => {
    const res = await request(app)
      .put('/api/v1/users/my-security')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        currentPassword: INITIAL_STUDENT_PASS,
        securityQuestion: 'ما هو اسم مدرستك الابتدائية؟',
        securityAnswer: 'مدرسة المنهاج',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hasSecurityQuestion).toBe(true);
  });

  it('allows fetching student security question from login screen without authentication', async () => {
    const res = await request(app)
      .get(`/api/v1/auth/security-question?registrationNumber=${TEST_STUDENT_REG}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('طالب الاختبار الأولي');
    expect(res.body.data.role).toBe('student');
    expect(res.body.data.question).toBe('ما هو اسم مدرستك الابتدائية؟');
  });

  it('rejects recovery if security answer is incorrect', async () => {
    const res = await request(app)
      .post('/api/v1/auth/recover')
      .send({
        registrationNumber: TEST_STUDENT_REG,
        securityAnswer: 'إجابة خاطئة تماماً',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('recovers student password remotely, returns generated password, and allows instant login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/recover')
      .send({
        registrationNumber: TEST_STUDENT_REG,
        securityAnswer: 'مدرسة المنهاج',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('student');
    expect(res.body.data.recoveredPassword).toBeDefined();
    expect(res.body.data.recoveredPassword.length).toBeGreaterThanOrEqual(6);

    const newGeneratedPass = res.body.data.recoveredPassword;

    // Verify the student can immediately log in with this recovered password!
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: TEST_STUDENT_REG, password: newGeneratedPass });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.role).toBe('student');
  });
});
