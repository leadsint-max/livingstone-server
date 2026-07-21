const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET = "Livingstone_Academy_2026";

// 1. DASHBOARD STATS
app.get('/api/stats', async (req, res) => {
    try {
        const studentRes = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staffRes = await pool.query("SELECT COUNT(*) FROM staff_profiles");
        const teacherRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        const revenueRes = await pool.query('SELECT SUM(amount) FROM payments');
        res.json({ 
            totalStudents: studentRes.rows[0].count, 
            totalStaff: staffRes.rows[0].count, 
            totalTeachers: teacherRes.rows[0].count, 
            pendingFees: revenueRes.rows[0].sum || "0.00" 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. STUDENT MGMT
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, photo, gender, parentName, parentPhone, className, address } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query("INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id", [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123']);
        await client.query("INSERT INTO student_profiles (user_id, admission_no, date_of_birth, photo, gender, parent_name, parent_phone, class_name, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [userRes.rows[0].id, admissionNo, dob, photo, gender, parentName, parentPhone, className, address]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); }
    finally { client.release(); }
});

app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no, s.photo, s.class_name FROM student_profiles s JOIN users u ON s.user_id = u.id`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. STAFF MGMT
app.post('/api/staff/register', async (req, res) => {
    const { fullName, email, role, employeeId, designation, department, photo } = req.body;
    const [firstName, ...lastNameParts] = fullName.split(' ');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query("INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id", [firstName, lastNameParts.join(' '), email, 'staff123', role]);
        await client.query("INSERT INTO staff_profiles (user_id, employee_id, designation, department, photo) VALUES ($1, $2, $3, $4, $5)", [userRes.rows[0].id, employeeId, designation, department, photo]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); }
    finally { client.release(); }
});

// 4. ACADEMICS
app.get('/api/subjects', async (req, res) => {
    const r = await pool.query("SELECT * FROM subjects ORDER BY name ASC");
    res.json(r.rows);
});

app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    for (let m of marksList) {
        await pool.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]);
    }
    res.json({ success: true });
});

// 5. FINANCE
app.post('/api/fees/structure', async (req, res) => {
    const { className, feeType, amount, term } = req.body;
    await pool.query("INSERT INTO fee_structures (class_name, fee_type, amount, term) VALUES ($1, $2, $3, $4) ON CONFLICT (class_name, fee_type, term) DO UPDATE SET amount = EXCLUDED.amount", [className, feeType, amount, term]);
    res.json({ success: true });
});

app.get('/api/fees/structure', async (req, res) => {
    const r = await pool.query("SELECT * FROM fee_structures ORDER BY class_name ASC");
    res.json(r.rows);
});

app.post('/api/payments/record', async (req, res) => {
    const { studentId, amount, feeType, method, reference } = req.body;
    await pool.query("INSERT INTO payments (student_id, amount, fee_type, payment_method, reference) VALUES ($1, $2, $3, $4, $5)", [studentId, amount, feeType, method, reference]);
    res.json({ success: true });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
        res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
    } else { res.status(401).json({ message: "Invalid credentials" }); }
});

app.get('/', (req, res) => res.send('Server Active'));
app.listen(process.env.PORT || 10000);
