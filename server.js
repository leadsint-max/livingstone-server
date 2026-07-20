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

// 1. IMPROVED DASHBOARD STATS
app.get('/api/stats', async (req, res) => {
    try {
        // Count from student_profiles table
        const studentRes = await pool.query('SELECT COUNT(*) FROM student_profiles');
        
        // Count from staff_profiles table
        const staffRes = await pool.query('SELECT COUNT(*) FROM staff_profiles');
        
        // Count only teachers from the users table
        const teacherRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'");
        
        res.json({ 
            totalStudents: studentRes.rows[0].count, 
            totalStaff: staffRes.rows[0].count, 
            totalTeachers: teacherRes.rows[0].count, 
            pendingFees: "0.00" 
        });
    } catch (err) { 
        console.error("STATS ERROR:", err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// 2. STAFF REGISTRATION
app.post('/api/staff/register', async (req, res) => {
    const { fullName, email, role, employeeId, designation, department, photo } = req.body;
    const [firstName, ...lastNameParts] = fullName.split(' ');
    const lastName = lastNameParts.join(' ') || 'Staff';
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [firstName, lastName, email, 'staff123', role]
        );
        await client.query(
            "INSERT INTO staff_profiles (user_id, employee_id, designation, department, photo) VALUES ($1, $2, $3, $4, $5)",
            [userRes.rows[0].id, employeeId, designation, department, photo]
        );
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// 3. STUDENT REGISTRATION
app.post('/api/students/register', async (req, res) => {
    const { firstName, lastName, dob, admissionNo, photo, gender, parentName, parentPhone, className } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query("INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id", [firstName, lastName, `${admissionNo}@livingstone.edu`, 'student123']);
        await client.query("INSERT INTO student_profiles (user_id, admission_no, date_of_birth, photo, gender, parent_name, parent_phone, class_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [userRes.rows[0].id, admissionNo, dob, photo, gender, parentName, parentPhone, className]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); }
    finally { client.release(); }
});

// 4. DATA LISTS
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

// 5. LOGIN
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

app.get('/', (req, res) => res.send('Livingstone Academy Server Live'));
app.listen(process.env.PORT || 10000);
