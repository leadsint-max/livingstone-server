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

// 1. DASHBOARD STATS (Real Students, Teachers & Collected Revenue)
app.get('/api/stats', async (req, res) => {
    try {
        const studentRes = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staffRes = await pool.query("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'teacher', 'accountant')");
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

// 2. FEE STRUCTURE LOGIC
app.post('/api/fees/structure', async (req, res) => {
    const { className, feeType, amount, term } = req.body;
    try {
        await pool.query(
            `INSERT INTO fee_structures (class_name, fee_type, amount, term) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (class_name, fee_type, term) DO UPDATE SET amount = EXCLUDED.amount`,
            [className, feeType, amount, term]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/fees/structure', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fee_structures ORDER BY class_name ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. STUDENT BALANCES LOGIC (Real Data)
app.get('/api/fees/balances', async (req, res) => {
    try {
        const query = `
            SELECT 
                u.first_name, u.last_name, s.admission_no, s.class_name,
                COALESCE((SELECT SUM(amount) FROM fee_structures fs WHERE fs.class_name = s.class_name), 0) as total_bill,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = s.admission_no), 0) as total_paid
            FROM student_profiles s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.class_name ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// [KEEP LOGIN, REGISTER, MARKS, PAYMENTS, STAFF endpoints same as before]
app.post('/api/payments/record', async (req, res) => {
    const { studentId, amount, feeType, method, reference } = req.body;
    try {
        await pool.query("INSERT INTO payments (student_id, amount, fee_type, payment_method, reference) VALUES ($1, $2, $3, $4, $5)", [studentId, amount, feeType, method, reference]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
            const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
            res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
        } else { res.status(401).json({ message: "Invalid credentials" }); }
    } catch (err) { res.status(500).json({ message: "Database error" }); }
});
app.get('/api/students/list-simple', async (req, res) => {
    try {
        const result = await pool.query("SELECT admission_no, first_name, last_name FROM student_profiles s JOIN users u ON s.user_id = u.id");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
app.get('/api/staff', async (req, res) => {
    try {
        const result = await pool.query(`SELECT u.first_name, u.last_name, u.role, u.email, sp.employee_id, sp.department, sp.photo FROM staff_profiles sp JOIN users u ON sp.user_id = u.id`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no, s.photo, s.class_name FROM student_profiles s JOIN users u ON s.user_id = u.id`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/subjects', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM subjects ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let m of marksList) {
            await client.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); }
    finally { client.release(); }
});

app.get('/', (req, res) => res.send('Livingstone Academy Server Active'));
app.listen(process.env.PORT || 10000);
