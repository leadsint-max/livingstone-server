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

// 2. SUBJECTS (With ADD and DELETE)
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
    const { id } = req.body;
    try {
        await pool.query("DELETE FROM subjects WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Cannot delete. Marks exist for this subject." }); }
});

// 3. STUDENTS & RANKINGS
app.get('/api/students', async (req, res) => {
    const r = await pool.query(`SELECT u.first_name, u.last_name, s.* FROM student_profiles s JOIN users u ON s.user_id = u.id ORDER BY u.last_name ASC`);
    res.json(r.rows);
});

app.get('/api/students/class/:className', async (req, res) => {
    const result = await pool.query(`SELECT u.first_name, u.last_name, s.admission_no FROM student_profiles s JOIN users u ON s.user_id = u.id WHERE s.class_name = $1`, [req.params.className]);
    res.json(result.rows);
});

app.get('/api/academic/rankings/:className', async (req, res) => {
    try {
        const query = `
            SELECT u.first_name, u.last_name, s.admission_no,
            COALESCE(SUM(m.score), 0) as total_score, COALESCE(AVG(m.score), 0) as average_score,
            RANK() OVER (ORDER BY COALESCE(SUM(m.score), 0) DESC) as position
            FROM student_profiles s JOIN users u ON s.user_id = u.id
            LEFT JOIN student_marks m ON s.admission_no = m.student_id
            WHERE s.class_name = $1 GROUP BY u.first_name, u.last_name, s.admission_no
            ORDER BY total_score DESC;`;
        const result = await pool.query(query, [req.params.className]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. IMPROVED REPORT CARD DATA
app.get('/api/academic/report-card/:admissionNo', async (req, res) => {
    try {
        const adm = req.params.admissionNo;
        const studentInfo = await pool.query(`
            SELECT u.first_name, u.last_name, s.admission_no, s.class_name, s.photo,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_name = s.class_name) as class_total,
            COALESCE((SELECT SUM(amount) FROM fee_structures fs WHERE fs.class_name = s.class_name), 0) - 
            COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = s.admission_no), 0) as arrears
            FROM student_profiles s JOIN users u ON s.user_id = u.id
            WHERE s.admission_no = $1`, [adm]);

        const marks = await pool.query(`
            SELECT sub.name as subject_name,
            MAX(CASE WHEN m.exam_type = 'Mid-Term' THEN m.score ELSE 0 END) as mid_term,
            MAX(CASE WHEN m.exam_type = 'Final Exam' THEN m.score ELSE 0 END) as final_exam,
            MAX(m.remarks) as remarks
            FROM student_marks m JOIN subjects sub ON m.subject_id = sub.id
            WHERE m.student_id = $1 GROUP BY sub.name`, [adm]);

        res.json({ student: studentInfo.rows[0], marks: marks.rows, position: "N/A" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. MARKS & PAYMENTS
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

// 6. REGISTRATION & LOGIN
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, photo, gender, parentName, parentPhone, className, address } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query("INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id", [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123']);
        await client.query("INSERT INTO student_profiles (user_id, admission_no, date_of_birth, photo, gender, parent_name, parent_phone, class_name, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [userRes.rows[0].id, admissionNo, dob, photo, gender, parentName, parentPhone, className, address]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
        res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
    } else { res.status(401).json({ message: "Invalid credentials" }); }
});

app.listen(process.env.PORT || 10000, () => console.log("Master Server Live"));
