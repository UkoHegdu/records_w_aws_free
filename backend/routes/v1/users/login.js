const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../../services/db'); // update this import as neededs

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        //console.log("DB user query result:", user.rows);

        if (!user.rows.length) {
            console.log("No user found with that email.");
            return res.status(401).json({ msg: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.rows[0].password);
        console.log("Password match result:", match);
        console.log("user ", email, " tried to log in");

        if (!match) {
            console.log("Password does not match.");
            return res.status(401).json({ msg: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Login failed due to server error' });
    }
};


module.exports = { login };

