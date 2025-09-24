// File: /frontend/src/pages/Mapper news.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Trophy, User, MapPin, RefreshCw, Search, AlertCircle } from 'lucide-react';
import apiClient from '../auth';


const MapperNews: React.FC = () => {
    const [mapUid, setMapUid] = useState('wQZaLfhFFBMhAuO0FRdVVLMOzo4');
    const [timeRange, setTimeRange] = useState('1d');
    const [result, setResult] = useState<{ error?: string; mapsAndLeaderboards?: unknown[] } | null>(null);

    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [mapsAndLeaderboards, setMapsAndLeaderboards] = useState<{ mapName: string; leaderboard: { playerName?: string; position?: number; timestamp?: number; time?: number }[] }[]>([]);
    const [loading, setLoading] = useState(false); //spinnneris
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<string>('');
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
            console.log('Making API call to get latest records');
            const res = await apiClient.get(
                `/api/v1/records/latest?mapUid=${mapUid}&period=${timeRange}`
            );
            setResult(res.data);
        } catch {
            setResult({ error: 'Something went wrong or no record found.' });
        }
    };

    const handleUsernameSearch = async () => {
        try {
            // Mocked call to get matching usernames
            console.log('Making API call to get latest records');
            const res = await apiClient.get(
                `/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch {
            setMatchedUsers([]);
        }
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

            const res = await apiClient.get(
                `/api/v1/users/maps/status/${jobId}`
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
        } catch (err: unknown) {
            console.error('Error polling job status:', err);

            // Check if it's a 404 or authentication error
            if ((err as { response?: { status?: number } })?.response?.status === 404) {
                setError('Job not found. The search may have failed or expired.');
            } else if ((err as { response?: { status?: number } })?.response?.status === 403) {
                setError('Unable to check job status. Access denied.');
            } else if ((err as { response?: { status?: number } })?.response?.status && (err as { response?: { status?: number } })?.response?.status! >= 500) {
                setError('Server error occurred while checking job status. Please try again.');
            } else {
                setError(`Error checking job status: ${(err as { message?: string })?.message || 'Unknown error'}`);
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
            const res = await apiClient.get(
                `/api/v1/users/maps?username=${username}&period=${mapSearchPeriod}`
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
        } catch (err: unknown) {
            console.error('Error starting map search:', err);
            setMapsAndLeaderboards([]);
            setLoading(false);
            setJobStatus('error');

            // Provide specific error messages
            if ((err as { response?: { status?: number } })?.response?.status === 500) {
                setError('Server error occurred while starting map search. Please try again.');
            } else if ((err as { response?: { status?: number } })?.response?.status === 400) {
                setError('Invalid request. Please check the username and try again.');
            } else {
                setError(`Failed to start map search: ${(err as { message?: string })?.message || 'Unknown error'}`);
            }
        }
    };

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-gradient-to-br from-secondary to-secondary-glow rounded-xl shadow-orange-glow">
                        <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Newest Times</h1>
                        <p className="text-muted-foreground">Latest records on your maps</p>
                    </div>
                </div>
                <div className="racing-card mb-8">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        Check Latest Records
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Map UID:
                                </label>
                                <input
                                    type="text"
                                    value={mapUid}
                                    onChange={(e) => setMapUid(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Time Range:
                                </label>
                                <select
                                    value={timeRange}
                                    onChange={(e) => setTimeRange(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                >
                                    <option value="1d">1 Day</option>
                                    <option value="1w">1 Week</option>
                                    <option value="1m">1 Month</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    className="btn-racing w-full flex items-center justify-center gap-2"
                                >
                                    <RefreshCw size={20} />
                                    Check
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {result && (
                    <div className="racing-card mb-8">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Trophy className="w-5 h-5" />
                            Results
                        </h3>
                        {result.error ? (
                            <div className="p-4 bg-destructive/20 border border-destructive/30 rounded-xl text-destructive">
                                <AlertCircle className="w-5 h-5 inline mr-2" />
                                {result.error}
                            </div>
                        ) : (
                            <pre className="bg-muted p-4 rounded-xl text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
                        )}
                    </div>
                )}

                {/* Search by map author box */}
                <div className="racing-card mb-8">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Search by map author
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Username:
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                <input
                                    type="text"
                                    value={usernameQuery}
                                    onChange={(e) => setUsernameQuery(e.target.value)}
                                    disabled={loading}
                                    placeholder="Enter TrackMania username"
                                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Time Period for Map Search:
                            </label>
                            <select
                                value={mapSearchPeriod}
                                onChange={(e) => setMapSearchPeriod(e.target.value)}
                                disabled={loading}
                                className="w-full px-3 py-3 rounded-xl bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
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
                                className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-center gap-2 ${loading
                                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                    : 'btn-racing-secondary'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        <Search size={20} />
                                        Search
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {matchedUsers.length > 0 && (
                    <div className="racing-card mb-8">
                        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <User className="w-5 h-5" />
                            Please select a user:
                        </h3>
                        {loading && (
                            <div className="p-4 bg-primary/20 border border-primary/30 rounded-xl text-primary mb-4">
                                <div className="flex items-center">
                                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
                                    <div>
                                        <strong>Search in Progress</strong>
                                        <p className="mt-1 text-sm">Please wait for the current search to complete before starting a new one.</p>
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
                                    className={`px-4 py-3 rounded-xl text-left transition-all duration-300 flex items-center gap-2 ${loading
                                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                        : 'bg-muted hover:bg-primary/10 text-foreground hover:border-primary/30 border border-border'
                                        }`}
                                >
                                    <User className="w-4 h-4" />
                                    {user}
                                </button>
                            ))}
                        </div>
                    </div>
                )}


                {loading ? (
                    <div className="racing-card text-center py-8">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
                            <span className="text-primary font-medium">
                                {jobStatus === 'starting' && 'Starting map search...'}
                                {jobStatus === 'pending' && 'Job queued, waiting to start...'}
                                {jobStatus === 'processing' && 'Processing maps and leaderboards...'}
                                {jobStatus === 'error' && 'Error occurred'}
                                {!jobStatus && 'Loading maps and leaderboards...'}
                            </span>
                        </div>
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
                            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm hover:bg-destructive/90 transition-colors duration-300"
                        >
                            Cancel
                        </button>
                        {jobId && (
                            <div className="mt-4 p-3 bg-muted rounded-xl">
                                <p className="text-sm text-muted-foreground">
                                    Job ID: <code className="text-foreground">{jobId}</code>
                                </p>
                            </div>
                        )}
                    </div>
                ) : error ? (
                    <div className="racing-card mb-8">
                        <div className="p-4 bg-destructive/20 border border-destructive/30 rounded-xl text-destructive">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 mr-3" />
                                <div>
                                    <strong>Operation Failed</strong>
                                    <p className="mt-1">{error}</p>
                                    {jobId && (
                                        <p className="text-sm mt-2 text-destructive/80">
                                            Job ID: {jobId}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    selectedUser && (
                        <div className="racing-card mb-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                    <Trophy className="w-6 h-6" />
                                    Leaderboards by {selectedUser}
                                </h3>
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
                                    className="btn-racing-secondary flex items-center gap-2"
                                >
                                    <RefreshCw size={20} />
                                    New Search
                                </button>
                            </div>
                            {mapsAndLeaderboards.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full bg-card border border-border rounded-xl shadow-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                                                    Map Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                                                    Player Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                                                    Position
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                                                    Date
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                                                    Time
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-card divide-y divide-border">
                                            {mapsAndLeaderboards.map((entry, idx) =>
                                                entry.leaderboard && entry.leaderboard.length > 0 ?
                                                    entry.leaderboard.map((record, recordIdx: number) => (
                                                        <tr key={`${idx}-${recordIdx}`} className="hover:bg-muted/30 transition-colors duration-200">
                                                            <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                                                                {entry.mapName}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                                                                {record.playerName || 'Unknown Player'}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                                                                #{record.position}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                                                                {record.timestamp ? formatDate(record.timestamp) : 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                                                                {record.timestamp ? formatTime(record.timestamp) : 'N/A'}
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                        <tr key={`${idx}-no-records`}>
                                                            <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground italic text-center border-b border-border">
                                                                No records found for {entry.mapName}
                                                            </td>
                                                        </tr>
                                                    )
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="racing-card text-center py-12">
                                    <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold mb-2">No Recent Records Found</h3>
                                    <p className="text-muted-foreground mb-4">
                                        No new records were found for {selectedUser}'s maps in the selected time period ({mapSearchPeriod === '1d' ? '1 day' : mapSearchPeriod === '1w' ? '1 week' : '1 month'}).
                                    </p>
                                    <div className="text-left max-w-md mx-auto">
                                        <p className="text-sm text-muted-foreground mb-2">This could mean:</p>
                                        <ul className="text-sm text-muted-foreground space-y-1">
                                            <li>• The maps don't have any recent activity</li>
                                            <li>• No players have set new records recently</li>
                                            <li>• Try selecting a longer time period above</li>
                                        </ul>
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