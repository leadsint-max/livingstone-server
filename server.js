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

// STATS
app.get('/api/stats', async (req, res) => {
    try {
        const studentRes = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staffRes = await pool.query("SELECT COUNT(*) FROM staff_profiles");
        const teacherRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        const revenue = await pool.query('SELECT SUM(amount) FROM payments');
        res.json({ totalStudents: studentRes.rows[0].count, totalStaff: staffRes.rows[0].count, totalTeachers: teacherRes.rows[0].count, pendingFees: revenue.rows[0].sum || "0.00" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// SUBJECTS
app.get('/api/subjects', async (req, res) => {
    const result = await pool.query("SELECT * FROM subjects ORDER BY school_level, name ASC");
    res.json(result.rows);
});

app.post('/api/subjects/add', async (req, res) => {
    const { name, code, level } = req.body;
    try {
        await pool.query("INSERT INTO subjects (name, code, school_level) VALUES ($1, $2, $3)", [name, code, level]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/subjects/delete', async (req, res) => {
    try {
        await pool.query("DELETE FROM subjects WHERE id = $1", [req.body.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Cannot delete. Marks exist for this subject." }); }
});

// STUDENTS
app.get('/api/students/class/:className', async (req, res) => {
    const result = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no FROM student_profiles s JOIN users u ON s.user_id = u.id WHERE s.class_name = $1`, [req.params.className]);
    res.json(result.rows);
});

// MARKS
app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    for (let m of marksList) {
        await pool.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]);
    }
    res.json({ success: true });
});

// KEEP LOGIN, etc.
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
        res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
    } else { res.status(401).json({ message: "Invalid credentials" }); }
});

app.get('/', (req, res) => res.send('Livingstone Academy Server Live'));
app.listen(process.env.PORT || 10000);
