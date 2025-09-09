// File: /frontend/src/pages/Mapper news.tsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const backendUrl = (import.meta as any).env.VITE_BACKEND_URL;


const MapperNews: React.FC = () => {
    const [mapUid, setMapUid] = useState('wQZaLfhFFBMhAuO0FRdVVLMOzo4');
    const [timeRange, setTimeRange] = useState('1d');
    const [result, setResult] = useState<any>(null);

    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [mapsAndLeaderboards, setMapsAndLeaderboards] = useState<any[]>([]);
    const [loading, setLoading] = useState(false); //spinnneris
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<string>('');
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [error, setError] = useState<string | null>(null);
    const pollingAttemptsRef = useRef<number>(0);
    const [mapSearchPeriod, setMapSearchPeriod] = useState('1d');

    // Cleanup polling interval on component unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            console.log('backendUrla čeks =', backendUrl);
            const res = await axios.get(
                `${backendUrl}/api/v1/records/latest?mapUid=${mapUid}&period=${timeRange}`
            );
            setResult(res.data);
        } catch (err) {
            setResult({ error: 'Something went wrong or no record found.' });
        }
    };

    const handleUsernameSearch = async () => {
        try {
            // Mocked call to get matching usernames
            console.log('backendUrla čeks =', backendUrl);
            const res = await axios.get(
                `${backendUrl}/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch (err) {
            setMatchedUsers([]);
        }
    };


    // Function to format timestamp
    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    // Function to format date as YYYY.MM.DD
    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
    };

    // Function to format time as HH:MM:SS
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-GB', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    // Function to poll job status
    const pollJobStatus = async (jobId: string) => {
        try {
            pollingAttemptsRef.current += 1;
            const currentAttempts = pollingAttemptsRef.current;
            console.log(`🔄 Polling attempt ${currentAttempts} for job ${jobId}`);

            // Timeout after 60 attempts (3 minutes)
            if (currentAttempts >= 60) {
                console.log(`⏰ Timeout reached after ${currentAttempts} attempts, stopping polling`);
                setError('Operation timed out. The map search is taking longer than expected. Please try again or contact support if this persists.');
                setLoading(false);
                setJobStatus('timeout');
                if (pollingIntervalRef.current) {
                    console.log('🛑 Clearing polling interval (timeout)');
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                return;
            }

            const res = await axios.get(
                `${backendUrl}/api/v1/users/maps/status/${jobId}`
            );

            const { status, result, error } = res.data;
            setJobStatus(status);

            if (status === 'failed') {
                console.log(`❌ Job ${jobId} failed, stopping polling`);
                setError(error || 'Map search failed. Please try again.');
                setLoading(false);
                setMapsAndLeaderboards([]);
                if (pollingIntervalRef.current) {
                    console.log('🛑 Clearing polling interval (failed)');
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                return;
            }

            if (status === 'completed') {
                console.log(`✅ Job ${jobId} completed successfully, stopping polling`);
                setMapsAndLeaderboards(result || []);
                setLoading(false);
                setError(null);
                if (pollingIntervalRef.current) {
                    console.log('🛑 Clearing polling interval');
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                return; // Important: return to prevent further execution
            }
            // If status is 'pending' or 'processing', continue polling
        } catch (err: any) {
            console.error('Error polling job status:', err);

            // Check if it's a 404 or authentication error
            if (err.response?.status === 404) {
                setError('Job not found. The search may have failed or expired.');
            } else if (err.response?.status === 403) {
                setError('Unable to check job status. Access denied.');
            } else if (err.response?.status >= 500) {
                setError('Server error occurred while checking job status. Please try again.');
            } else {
                setError(`Error checking job status: ${err.message}`);
            }

            setLoading(false);
            setJobStatus('error');
            if (pollingIntervalRef.current) {
                console.log('🛑 Clearing polling interval (error)');
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        }
    };

    const handleUserSelect = async (username: string) => {
        // Prevent multiple simultaneous searches
        if (loading) {
            console.log('⚠️ Search already in progress, ignoring new request');
            return;
        }

        setSelectedUser(username);
        setLoading(true);
        setJobStatus('starting');
        setMapsAndLeaderboards([]);
        setError(null);
        pollingAttemptsRef.current = 0;

        // Clear any existing polling
        if (pollingIntervalRef.current) {
            console.log('🛑 Clearing existing polling interval before starting new search');
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }

        try {
            // Start the map search job
            const res = await axios.get(
                `${backendUrl}/api/v1/users/maps?username=${username}&period=${mapSearchPeriod}`
            );

            if (res.status === 202 && res.data.jobId) {
                // Job started successfully
                setJobId(res.data.jobId);
                setJobStatus('pending');

                // Start polling every 3 seconds
                console.log(`🔄 Starting polling for job ${res.data.jobId}`);
                const interval = setInterval(() => {
                    pollJobStatus(res.data.jobId);
                }, 3000);
                pollingIntervalRef.current = interval;

                // Initial poll
                pollJobStatus(res.data.jobId);
            } else {
                // Fallback for old API response
                setMapsAndLeaderboards(res.data);
                setLoading(false);
            }
        } catch (err: any) {
            console.error('Error starting map search:', err);
            setMapsAndLeaderboards([]);
            setLoading(false);
            setJobStatus('error');

            // Provide specific error messages
            if (err.response?.status === 500) {
                setError('Server error occurred while starting map search. Please try again.');
            } else if (err.response?.status === 400) {
                setError('Invalid request. Please check the username and try again.');
            } else {
                setError(`Failed to start map search: ${err.message}`);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">🧪 Newest times from your maps</h1>
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Map UID:
                                </label>
                                <input
                                    type="text"
                                    value={mapUid}
                                    onChange={(e) => setMapUid(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Time Range:
                                </label>
                                <select
                                    value={timeRange}
                                    onChange={(e) => setTimeRange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="1d">1 Day</option>
                                    <option value="1w">1 Week</option>
                                    <option value="1m">1 Month</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    Check
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {result && (
                    <div className="result-box">
                        {result.error ? (
                            <p className="error-text">{result.error}</p>
                        ) : (
                            <pre>{JSON.stringify(result, null, 2)}</pre>
                        )}
                    </div>
                )}

                <hr className="my-8 border-gray-300" />

                <div className="bg-white rounded-lg shadow p-6 mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">🔍 Search by map author</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Username:
                            </label>
                            <input
                                type="text"
                                value={usernameQuery}
                                onChange={(e) => setUsernameQuery(e.target.value)}
                                disabled={loading}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Time Period for Map Search:
                            </label>
                            <select
                                value={mapSearchPeriod}
                                onChange={(e) => setMapSearchPeriod(e.target.value)}
                                disabled={loading}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                            >
                                <option value="1d">1 Day</option>
                                <option value="1w">1 Week</option>
                                <option value="1m">1 Month</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleUsernameSearch}
                                disabled={loading}
                                className={`w-full px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${loading
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>
                </div>

                {matchedUsers.length > 0 && (
                    <div className="bg-white rounded-lg shadow p-6 mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Please select a user:</h3>
                        {loading && (
                            <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
                                <div className="flex items-center">
                                    <span className="text-blue-500 mr-2">⏳</span>
                                    <div>
                                        <strong>Search in Progress</strong>
                                        <p className="mt-1">Please wait for the current search to complete before starting a new one.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {matchedUsers.map((user) => (
                                <button
                                    key={user}
                                    onClick={() => !loading && handleUserSelect(user)}
                                    disabled={loading}
                                    className={`px-4 py-2 rounded-md text-left transition-colors ${loading
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                        }`}
                                >
                                    {user}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center p-4">
                        <span className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></span>
                        <span className="ml-2 text-blue-500">
                            {jobStatus === 'starting' && 'Starting map search...'}
                            {jobStatus === 'pending' && 'Job queued, waiting to start...'}
                            {jobStatus === 'processing' && 'Processing maps and leaderboards...'}
                            {jobStatus === 'error' && 'Error occurred'}
                            {!jobStatus && 'Loading maps and leaderboards...'}
                        </span>
                        <button
                            onClick={() => {
                                console.log('🛑 User cancelled search, stopping polling');
                                setLoading(false);
                                setJobStatus('');
                                setError('Search cancelled by user');
                                if (pollingIntervalRef.current) {
                                    clearInterval(pollingIntervalRef.current);
                                    pollingIntervalRef.current = null;
                                }
                            }}
                            className="ml-4 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        >
                            Cancel
                        </button>
                    </div>
                ) : error ? (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                        <div className="flex items-center">
                            <span className="text-red-500 mr-2">⚠️</span>
                            <div>
                                <strong>Operation Failed</strong>
                                <p className="mt-1">{error}</p>
                                {jobId && (
                                    <p className="text-sm mt-2 text-red-600">
                                        Job ID: {jobId}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    selectedUser && (
                        <div className="bg-white rounded-lg shadow p-6 mb-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold text-gray-900">Leaderboards by {selectedUser}</h3>
                                <button
                                    onClick={() => {
                                        console.log('🔄 Starting new search');
                                        setSelectedUser(null);
                                        setMapsAndLeaderboards([]);
                                        setError(null);
                                        setJobId(null);
                                        setJobStatus('');
                                        pollingAttemptsRef.current = 0;
                                        if (pollingIntervalRef.current) {
                                            clearInterval(pollingIntervalRef.current);
                                            pollingIntervalRef.current = null;
                                        }
                                    }}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    🔄 New Search
                                </button>
                            </div>
                            {mapsAndLeaderboards.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                                    Map Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                                    Player Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                                    Position
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                                    Date
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                                    Time
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {mapsAndLeaderboards.map((entry, idx) =>
                                                entry.leaderboard && entry.leaderboard.length > 0 ?
                                                    entry.leaderboard.map((record: any, recordIdx: number) => (
                                                        <tr key={`${idx}-${recordIdx}`} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-b">
                                                                {entry.mapName}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-b">
                                                                {record.playerName || 'Unknown Player'}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-b">
                                                                #{record.position}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-b">
                                                                {formatDate(record.timestamp)}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-b">
                                                                {formatTime(record.timestamp)}
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                        <tr key={`${idx}-no-records`}>
                                                            <td colSpan={5} className="px-4 py-3 text-sm text-gray-500 italic text-center border-b">
                                                                No records found for {entry.mapName}
                                                            </td>
                                                        </tr>
                                                    )
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                                    <div className="flex items-center">
                                        <span className="text-yellow-500 mr-2">ℹ️</span>
                                        <div>
                                            <strong>No Recent Records Found</strong>
                                            <p className="mt-1">
                                                No new records were found for {selectedUser}'s maps in the selected time period ({mapSearchPeriod === '1d' ? '1 day' : mapSearchPeriod === '1w' ? '1 week' : '1 month'}).
                                                This could mean:
                                            </p>
                                            <ul className="mt-2 ml-4 list-disc text-sm">
                                                <li>The maps don't have any recent activity</li>
                                                <li>No players have set new records recently</li>
                                                <li>Try selecting a longer time period above</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default MapperNews;