import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const backendUrl = import.meta.env.VITE_API_URL || ''; // adjust if needed

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUsername, setSelectedUsername] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUsername) {
            setError('Please select a Trackmania username.');
            return;
        }

        try {
            await axios.post(`${backendUrl}/api/v1/users/register`, {
                email,
                password,
                username: selectedUsername
            });
            navigate('/login');
        } catch (err: any) {
            const msg = err?.response?.data?.msg || 'Registration failed';
            setError(msg);
        }
    };

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

    return (
        <div className="auth-container">
            <h2>Register</h2>
            <form onSubmit={handleRegister}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />

                <div>
                    <input
                        type="text"
                        placeholder="Search tmx Username"
                        value={usernameQuery}
                        onChange={e => setUsernameQuery(e.target.value)}
                    />
                    <button type="button" onClick={handleUsernameSearch}>
                        Search
                    </button>
                </div>

                {matchedUsers.length > 0 && (
                    <ul>
                        {matchedUsers.map((name) => (
                            <li key={name}>
                                <button type="button" onClick={() => setSelectedUsername(name)}>
                                    {name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {selectedUsername && (
                    <p>
                        ✅ Selected tmx username: <strong>{selectedUsername}</strong>
                    </p>
                )}

                {error && <p style={{ color: 'red' }}>{error}</p>}

                <button type="submit">Register</button>
            </form>
            <p>
                Already have an account? <Link to="/login">Login here</Link>
            </p>
        </div>
    );
};

export default Register;