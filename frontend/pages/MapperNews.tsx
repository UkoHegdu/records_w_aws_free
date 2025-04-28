// File: /frontend/src/pages/Mapper news.tsx
import React, { useState } from 'react';
import axios from 'axios';
const backendUrl = import.meta.env.VITE_BACKEND_URL;


const MapperNews: React.FC = () => {
    const [mapUid, setMapUid] = useState('wQZaLfhFFBMhAuO0FRdVVLMOzo4');
    const [timeRange, setTimeRange] = useState('1d');
    const [result, setResult] = useState<any>(null);

    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [mapsAndLeaderboards, setMapsAndLeaderboards] = useState<any[]>([]);
    const [loading, setLoading] = useState(false); //spinnneris

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.get(
                `http://${backendUrl}/api/v1/records/latest?mapUid=${mapUid}&period=${timeRange}`
            );
            setResult(res.data);
        } catch (err) {
            setResult({ error: 'Something went wrong or no record found.' });
        }
    };

    const handleUsernameSearch = async () => {
        try {
            // Mocked call to get matching usernames
            const res = await axios.get(
                `http://${backendUrl}/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch (err) {
            setMatchedUsers([]);
        }
    };

    const handleUserSelect = async (username: string) => {
        setSelectedUser(username);
        setLoading(true); // ⏳ show spinner
        try {
            const res = await axios.get(
                `http://${backendUrl}/api/v1/users/maps?username=${username}`
            );
            setMapsAndLeaderboards(res.data);
        } catch (err) {
            setMapsAndLeaderboards([]);
        } finally {
            setLoading(false); // ✅ hide spinner
        }
    };

    return (
        <>
            <h1>🧪 Newest times from your maps</h1>
            <form onSubmit={handleSubmit}>
                <label>
                    Map UID:
                    <input
                        type="text"
                        value={mapUid}
                        onChange={(e) => setMapUid(e.target.value)}
                        required
                        size={50}
                    />
                </label>
                <label>
                    Time Range:
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                    >
                        <option value="1d">1 Day</option>
                        <option value="1w">1 Week</option>
                        <option value="1m">1 Month</option>
                    </select>
                </label>
                <button type="submit">Check</button>
            </form>

            {result && (
                <div className="result-box">
                    {result.error ? (
                        <p className="error-text">{result.error}</p>
                    ) : (
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                    )}
                </div>
            )}

            <hr style={{ margin: '2rem 0' }} />

            <h2>🔍 Search by map author</h2>
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

            {loading ? (
                <div className="flex justify-center items-center p-4">
                    <span className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></span>
                    <span className="ml-2 text-blue-500">Loading maps and leaderboards...</span>
                </div>
            ) : (
                selectedUser && mapsAndLeaderboards.length > 0 && (
                    <div>
                        <h3>Leaderboards by {selectedUser}</h3>
                        {mapsAndLeaderboards.map((entry, idx) => (
                            <div key={idx} style={{ marginBottom: '1.5rem' }}>
                                <strong>{entry.mapName}</strong>
                                <pre>{JSON.stringify(entry.leaderboard, null, 2)}</pre>
                            </div>
                        ))}
                    </div>
                )
            )}
        </>
    );
};

export default MapperNews;