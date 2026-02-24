import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Search } from 'lucide-react';
import apiClient from '../auth';

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUsername, setSelectedUsername] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!selectedUsername) {
            setError('Please select a Trackmania username.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        try {
            await apiClient.post(`/api/v1/users/register`, {
                email,
                password,
                username: selectedUsername
            });
            navigate('/login');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg || 'Registration failed';
            setError(msg);
        }
    };

    const handleUsernameSearch = async () => {
        try {
            const res = await apiClient.get(
                `/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch {
            setMatchedUsers([]);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="racing-card text-center">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-8">
                        <div className="p-4 bg-gradient-to-br from-primary to-secondary-bright rounded-2xl shadow-glow">
                            <UserPlus className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold mb-2">
                        <span className="bg-gradient-to-r from-primary to-secondary-bright bg-clip-text text-transparent">
                            Create Account
                        </span>
                    </h1>
                    <p className="text-muted-foreground mb-8">
                        Join the TrackMania community
                    </p>

                    <form onSubmit={handleRegister} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                />
                            </div>

                            <div>
                                <input
                                    type="password"
                                    placeholder="Password (min 8 characters)"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                />
                            </div>

                            <div>
                                <input
                                    type="password"
                                    placeholder="Confirm password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search TrackMania username"
                                        value={usernameQuery}
                                        onChange={e => setUsernameQuery(e.target.value)}
                                        className="flex-1 px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleUsernameSearch}
                                        className="px-4 py-3 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold rounded-xl shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
                                    >
                                        <Search className="w-5 h-5" />
                                    </button>
                                </div>

                                {matchedUsers.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto space-y-2">
                                        {matchedUsers.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => setSelectedUsername(name)}
                                                className={`w-full p-3 rounded-xl text-left transition-all duration-300 ${selectedUsername === name
                                                    ? 'bg-gradient-to-r from-primary/20 to-secondary-bright/20 text-primary border border-primary/30'
                                                    : 'bg-muted hover:bg-muted/80 text-foreground'
                                                    }`}
                                            >
                                                <User className="w-4 h-4 inline mr-2" />
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {selectedUsername && (
                                    <div className="p-3 bg-gradient-to-r from-secondary-bright/10 to-secondary-bright/5 border border-secondary-bright/20 rounded-xl">
                                        <p className="text-sm text-secondary-bright">
                                            ✅ Selected username: <strong>{selectedUsername}</strong>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full btn-racing py-3 px-6 text-lg font-semibold"
                        >
                            Create Account
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-muted-foreground">
                            Already have an account?{' '}
                            <Link
                                to="/login"
                                className="text-primary hover:text-primary-glow transition-colors duration-300 font-semibold"
                            >
                                Login here
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;