const bcrypt = require('bcrypt');
//import jwt from 'jsonwebtoken';
const db = require('../../../services/db'); // update this import as neededs


// POST /api/v1/users/register
const register = async (req, res) => {
    const { email, password, username } = req.body;
    console.log('welcome to REDŽISTĒR FANKŠON!!!');

    if (!email || !password || !username)
        return res.status(400).json({ msg: 'Missing required fields' });

    const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0)
        return res.status(400).json({ msg: 'Email already registered' });

    const existingUsername = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0)
        return res.status(400).json({ msg: 'Username already selected' });

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
        'INSERT INTO users (email, password, username) VALUES ($1, $2, $3)',
        [email, hashedPassword, username]
    );

    res.status(201).json({ msg: 'User registered successfully' });
};

module.exports = { register };
