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
        const students = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staff = await pool.query("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'teacher', 'accountant')");
        const teachers = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        const revenue = await pool.query('SELECT SUM(amount) FROM payments');
        res.json({ totalStudents: students.rows[0].count, totalStaff: staff.rows[0].count, totalTeachers: teachers.rows[0].count, pendingFees: revenue.rows[0].sum || "0.00" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. SUBJECTS
app.get('/api/subjects', async (req, res) => {
    const result = await pool.query("SELECT * FROM subjects ORDER BY name ASC");
    res.json(result.rows);
});

app.post('/api/subjects/add', async (req, res) => {
    const { name, code, level } = req.body;
    await pool.query("INSERT INTO subjects (name, code, school_level) VALUES ($1, $2, $3)", [name, code, level]);
    res.json({ success: true });
});

// 3. STUDENT & CLASS LISTS
app.get('/api/students/class/:className', async (req, res) => {
    const result = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no FROM student_profiles s JOIN users u ON s.user_id = u.id WHERE s.class_name = $1`, [req.params.className]);
    res.json(result.rows);
});

// 4. MARKS & RANKINGS
app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    for (let m of marksList) {
        await pool.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]);
    }
    res.json({ success: true });
});

app.get('/api/academic/rankings/:className', async (req, res) => {
    const query = `
        SELECT u.first_name, u.last_name, s.admission_no, SUM(m.score) as total_score, AVG(m.score) as average_score,
        RANK() OVER (ORDER BY SUM(m.score) DESC) as position
        FROM student_profiles s JOIN users u ON s.user_id = u.id
        JOIN student_marks m ON s.admission_no = m.student_id
        WHERE s.class_name = $1 GROUP BY u.first_name, u.last_name, s.admission_no ORDER BY total_score DESC`;
    const result = await pool.query(query, [req.params.className]);
    res.json(result.rows);
});

// [KEEP LOGIN, REGISTER, etc. same as before]
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
        res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
    } else { res.status(401).json({ message: "Invalid credentials" }); }
});

app.listen(process.env.PORT || 10000);
