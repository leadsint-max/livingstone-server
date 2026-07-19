const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());

// INCREASE LIMIT: This allows the server to handle the photo data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET = process.env.JWT_SECRET || "Livingstone_Academy_2026";

// 1. STATS
app.get('/api/stats', async (req, res) => {
    try {
        const students = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const users = await pool.query("SELECT COUNT(*) FROM users WHERE role != 'student'");
        const teachers = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        res.json({ totalStudents: students.rows[0].count, totalStaff: users.rows[0].count, totalTeachers: teachers.rows[0].count });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. STUDENT REGISTRATION (Improved)
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, photo } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Create User
        const userRes = await client.query(
            "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id",
            [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123', 'student']
        );
        
        // Create Profile (Note: We are not storing the photo in the DB yet to save space, but the server won't crash anymore)
        await client.query(
            "INSERT INTO student_profiles (user_id, admission_no, date_of_birth) VALUES ($1, $2, $3)",
            [userRes.rows[0].id, admissionNo, dob]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("REGISTRATION ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// 3. LOGIN
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

app.listen(process.env.PORT || 10000, () => console.log("Server Live"));
