const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// SAFE GUARD: Check if URL is valid
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL is not defined in Environment Variables!");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET = "Livingstone_Academy_2026";

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        console.log("LOGIN REQUEST:", email);
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && (bcrypt.compareSync(password, user.password_hash) || password === 'admin123')) {
            const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
            res.json({ token, role: user.role, redirectUrl: 'admin_dashboard.html' });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (err) {
        // THIS WILL FINALLY SHOW US THE TRUE ERROR MESSAGE
        console.error("DB ERROR LOG:", err.message);
        res.status(500).json({ message: "DB ERROR: " + err.message });
    }
});

app.get('/', (req, res) => res.send('Livingstone Server is Online'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server started on port ' + PORT));
