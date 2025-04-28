// File: /backend/routes/v1/users/create_alert.js
const pool = require('../../../services/db');

const create_alertF = async (req, res) => {
    const { username, email } = req.body;
    console.log('sveicināti alerta izveidošanas funkcijā, vēlu jauki pavadīt laiku')
    try {
        await pool.query(
            'INSERT INTO alerts (username, email, userid, created_at) VALUES ($1, $2, 444, NOW())', //replace userid possibly with the correct user_id or account_id
            [username, email]
        );
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
};

module.exports = { create_alertF };
