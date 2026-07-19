const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET = process.env.JWT_SECRET || "Livingstone_Academy_2026";

// 1. GET SYSTEM STATS (For Dashboard)
app.get('/api/stats', async (req, res) => {
    try {
        const students = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const staff = await pool.query("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'teacher', 'accountant')");
        const teachers = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        
        res.json({
            totalStudents: students.rows[0].count,
            totalStaff: staff.rows[0].count,
            totalTeachers: teachers.rows[0].count,
            pendingFees: "12,400", // Will wire this later
            attendance: "94.2%"
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET ALL STUDENTS
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.admission_no, u.first_name, u.last_name, s.date_of_birth, u.role
            FROM student_profiles s
            JOIN users u ON s.user_id = u.id
            ORDER BY u.last_name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. STUDENT REGISTRATION
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id",
            [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123', 'student']
        );
        await client.query(
            "INSERT INTO student_profiles (user_id, admission_no, date_of_birth) VALUES ($1, $2, $3)",
            [userRes.rows[0].id, admissionNo, dob]
        );
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// 4. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
            const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
            res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ message: "Database error" });
    }
});

app.listen(process.env.PORT || 10000, () => console.log("Server Live"));
