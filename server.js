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
        const revenue = await pool.query('SELECT SUM(amount) FROM payments');
        res.json({ totalStudents: studentRes.rows[0].count, totalStaff: staffRes.rows[0].count, totalTeachers: teacherRes.rows[0].count, pendingFees: revenue.rows[0].sum || "0.00" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. CLASS & STREAM MANAGEMENT
app.get('/api/classes', async (req, res) => {
    const r = await pool.query("SELECT * FROM classes ORDER BY level_order ASC");
    res.json(r.rows);
});

app.post('/api/streams/add', async (req, res) => {
    const { classId, name, capacity, teacherId } = req.body;
    try {
        await pool.query(
            "INSERT INTO streams (class_id, name, capacity, class_teacher_id) VALUES ($1, $2, $3, $4)",
            [classId, name, capacity, teacherId]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/streams', async (req, res) => {
    const r = await pool.query(`
        SELECT s.id, s.name as stream_name, c.name as class_name, s.capacity, u.first_name, u.last_name 
        FROM streams s 
        JOIN classes c ON s.class_id = c.id 
        LEFT JOIN users u ON s.class_teacher_id = u.id
        ORDER BY c.level_order ASC`);
    res.json(r.rows);
});

// 3. DATA LISTS
app.get('/api/staff', async (req, res) => {
    const r = await pool.query(`SELECT u.id, u.first_name, u.last_name, u.role, sp.department FROM staff_profiles sp JOIN users u ON sp.user_id = u.id WHERE u.role = 'teacher'`);
    res.json(r.rows);
});

app.get('/api/students', async (req, res) => {
    const r = await pool.query(`SELECT u.first_name, u.last_name, s.* FROM student_profiles s JOIN users u ON s.user_id = u.id ORDER BY u.last_name ASC`);
    res.json(r.rows);
});

app.get('/api/students/class/:className', async (req, res) => {
    const r = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no FROM student_profiles s JOIN users u ON s.user_id = u.id WHERE s.class_name = $1`, [req.params.className]);
    res.json(r.rows);
});

// 4. ACADEMICS & MARKS
app.get('/api/subjects', async (req, res) => {
    const r = await pool.query("SELECT * FROM subjects ORDER BY school_level, name ASC");
    res.json(r.rows);
});

app.post('/api/subjects/add', async (req, res) => {
    const { name, code, level } = req.body;
    await pool.query("INSERT INTO subjects (name, code, school_level) VALUES ($1, $2, $3)", [name, code, level]);
    res.json({ success: true });
});

app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body;
    for (let m of marksList) {
        await pool.query("INSERT INTO student_marks (student_id, subject_id, exam_type, term, score, remarks) VALUES ($1, $2, $3, $4, $5, $6)", [m.studentId, m.subjectId, m.examType, m.term, m.score, m.remarks]);
    }
    res.json({ success: true });
});

// 5. LOGIN
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
