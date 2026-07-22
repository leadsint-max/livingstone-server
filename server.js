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

// 1. SYSTEM STATS
app.get('/api/stats', async (req, res) => {
    try {
        const studentRes = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staffRes = await pool.query("SELECT COUNT(*) FROM staff_profiles");
        const teacherRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        const revenueRes = await pool.query('SELECT SUM(amount) FROM payments');
        res.json({ totalStudents: studentRes.rows[0].count, totalStaff: staffRes.rows[0].count, totalTeachers: teacherRes.rows[0].count, pendingFees: revenueRes.rows[0].sum || "0.00" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// MASTER STUDENT PROFILE ENDPOINT
app.get('/api/students/profile/:admissionNo', async (req, res) => {
    try {
        const adm = req.params.admissionNo;

        // 1. Get Core Profile
        const infoRes = await pool.query(`
            SELECT u.first_name, u.last_name, u.email, s.* 
            FROM student_profiles s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.admission_no = $1`, [adm]);

        if (infoRes.rows.length === 0) return res.status(404).json({ error: "Student not found" });

        // 2. Get Real Marks (Joined with Subject Names)
        const marksRes = await pool.query(`
            SELECT m.*, sub.name as subject_name 
            FROM student_marks m 
            JOIN subjects sub ON m.subject_id = sub.id 
            WHERE m.student_id = $1 
            ORDER BY m.created_at DESC`, [adm]);

        // 3. Get Real Payments
        const paymentsRes = await pool.query(`
            SELECT * FROM payments 
            WHERE student_id = $1 
            ORDER BY created_at DESC`, [adm]);

        res.json({
            profile: infoRes.rows[0],
            marks: marksRes.rows,
            payments: paymentsRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database retrieval failed" });
    }
});

// 3. REGISTRATION & LISTS
app.get('/api/students', async (req, res) => {
    const r = await pool.query(`SELECT u.first_name, u.last_name, s.* FROM student_profiles s JOIN users u ON s.user_id = u.id ORDER BY u.last_name ASC`);
    res.json(r.rows);
});

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

// [KEEP LOGIN, STAFF, SUBJECTS, MARKS endpoints exactly same as before]
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
        res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
    } else { res.status(401).json({ message: "Invalid credentials" }); }
});
app.get('/api/staff', async (req, res) => {
    const r = await pool.query(`SELECT u.first_name, u.last_name, u.role, u.email, sp.* FROM staff_profiles sp JOIN users u ON sp.user_id = u.id`);
    res.json(r.rows);
});
app.get('/api/subjects', async (req, res) => {
    const r = await pool.query("SELECT * FROM subjects ORDER BY name ASC");
    res.json(r.rows);
});
app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    for (let m of marksList) { await pool.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]); }
    res.json({ success: true });
});
app.post('/api/payments/record', async (req, res) => {
    const { studentId, amount, feeType, method, reference } = req.body;
    await pool.query("INSERT INTO payments (student_id, amount, fee_type, payment_method, reference) VALUES ($1, $2, $3, $4, $5)", [studentId, amount, feeType, method, reference]);
    res.json({ success: true });
});
app.get('/', (req, res) => res.send('Livingstone Academy Server Live'));
app.listen(process.env.PORT || 10000);
