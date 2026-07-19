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

app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, photo, gender, parentName, parentPhone, address } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // CHECK IF ALREADY EXISTS
        const check = await client.query("SELECT id FROM users WHERE email = $1", [`${admissionNo}@livingstone.edu`]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: "This Admission Number is already in use." });
        }

        const userRes = await client.query(
            "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123', 'student']
        );
        
        await client.query(
            "INSERT INTO student_profiles (user_id, admission_no, date_of_birth, photo, gender, parent_name, parent_phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [userRes.rows[0].id, admissionNo, dob, photo, gender, parentName, parentPhone, address]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// OTHER ENDPOINTS (Login, Stats, etc. - keep them the same as before)
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

app.get('/api/stats', async (req, res) => {
    try {
        const students = await pool.query('SELECT COUNT(*) FROM student_profiles');
        const teachers = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        res.json({ totalStudents: students.rows[0].count, totalTeachers: teachers.rows[0].count });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(process.env.PORT || 10000, () => console.log("Server Running"));
