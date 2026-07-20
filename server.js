// ... [Keep existing code at top] ...

// 6. GET ALL SUBJECTS
app.get('/api/subjects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. SAVE MARKS (Bulk)
app.post('/api/marks/save', async (req, res) => {
    const { marksList } = req.body; // Array of student marks
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const entry of marksList) {
            await client.query(
                "INSERT INTO marks (student_id, subject_id, exam_type, score, max_score, teacher_remarks) VALUES ($1, $2, $3, $4, $5, $6)",
                [entry.studentId, entry.subjectId, entry.examType, entry.score, entry.maxScore, entry.remarks]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// 8. GET STUDENT MARKS (For Report Card)
app.get('/api/marks/:admissionNo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, s.name as subject_name 
            FROM marks m 
            JOIN subjects s ON m.subject_id = s.id 
            WHERE m.student_id = $1`, 
            [req.params.admissionNo]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ... [Keep app.listen at bottom] ...
