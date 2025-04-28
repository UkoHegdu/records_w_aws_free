import React, { useState } from 'react';
import axios from 'axios';
const backendUrl = process.env.BACKEND_URL;


const MapperAlerts: React.FC = () => {
    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleUsernameSearch = async () => {
        try {
            const res = await axios.get(
                `${backendUrl}/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch (err) {
            setMatchedUsers([]);
        }
    };

    const handleUserSelect = (username: string) => {
        setSelectedUser(username);
        setSubmitted(false);
    };

    const handleSubmit = async () => {
        if (!selectedUser || !email) return;
        try {
            await axios.post(`${backendUrl}/api/v1/users/create_alert`, {
                username: selectedUser,
                email,
            });
            setSubmitted(true);
        } catch (err) {
            console.error('Nesanaaca uztaisīt alertu :(', err);
        }
    };

    return (
        <>
            <h1>📍 Set up a mapper alert</h1>

            <h2>🔍 First, pick your username </h2>
            <label>
                Username:
                <input
                    type="text"
                    value={usernameQuery}
                    onChange={(e) => setUsernameQuery(e.target.value)}
                />
                <button onClick={handleUsernameSearch}>Search</button>
            </label>

            {matchedUsers.length > 0 && (
                <div>
                    <h3>Please select a user:</h3>
                    <ul>
                        {matchedUsers.map((user) => (
                            <li
                                key={user}
                                style={{ cursor: 'pointer', color: 'blue' }}
                                onClick={() => handleUserSelect(user)}
                            >
                                {user}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {selectedUser && (
                <div>
                    <h3>📧 Enter your e-mail to get alerts for {selectedUser}</h3>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button onClick={handleSubmit}>Send me (daily) alerts for my maps</button>
                    {submitted && <p>✅ You're subscribed for alerts!</p>}
                </div>
            )}
        </>
    );
};

export default MapperAlerts;
