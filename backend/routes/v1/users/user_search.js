const axios = require('axios');


const userSearchF = async (req, res) => {
    const { username } = req.query;
    console.log('🔥 userSearchF izsaukta!!');

    const url = `https://trackmania.exchange/api/users?Name=${username}&fields=Name%2CUserId`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (data.More) {
            return res.status(400).json({
                message: 'Too many results, please write an exact username',
            });
        }

        return res.json(data.Results); // return only the results if ok
    } catch (error) {
        console.error('Errors meklējot jūzeri user:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { userSearchF };
