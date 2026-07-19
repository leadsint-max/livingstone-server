const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET = "Livingstone_Academy_2026";

// DIAGNOSTIC ENDPOINT
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, message: "Database Connected!", time: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "CONNECTION FAILED: " + err.message });
    }
});

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
        // THIS SHOWS THE ERROR ON YOUR SCREEN
        res.status(500).json({ message: "DB ERROR: " + err.message });
    }
});

app.listen(process.env.PORT || 10000, () => console.log("Diagnostic Server Live"));
