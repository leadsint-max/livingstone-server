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

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        // Master key logic included as requested previously
        if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
            const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
            res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error: " + err.message });
    }
});

// 2. GET ALL STUDENTS (The "Wiring" part)
app.get('/api/students', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id, 
                u.first_name, 
                u.last_name, 
                s.admission_no, 
                c.name as class_name,
                g.user_id as guardian_id
            FROM student_profiles s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN classes c ON s.school_id = c.school_id -- Simplified for now
            LEFT JOIN guardians g ON s.guardian_id = g.id
            ORDER BY u.last_name ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching students" });
    }
});

// 3. REGISTER STUDENT
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, classId, email } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // First, create the user record
        const userRes = await client.query(
            "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id",
            [firstName, lastName, email || `${admissionNo}@livingstone.edu`, 'hashed_pass', 'student']
        );
        
        const userId = userRes.rows[0].id;

        // Then, create the student profile
        const studentRes = await client.query(
            "INSERT INTO student_profiles (user_id, admission_no, date_of_birth) VALUES ($1, $2, $3) RETURNING *",
            [userId, admissionNo, dob]
        );

        await client.query('COMMIT');
        res.json({ success: true, student: studentRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Livingstone Server Live on ' + PORT));
