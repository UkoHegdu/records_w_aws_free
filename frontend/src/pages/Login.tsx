import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, ArrowRight } from 'lucide-react';
import apiClient from '../auth';
import { toast } from 'sonner';

interface LoginProps {
    setIsLoggedIn: (value: boolean) => void;
}

const Login: React.FC<LoginProps> = ({ setIsLoggedIn }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Replace with your actual API endpoint
            const response = await apiClient.post('/api/v1/users/login', {
                email: username, // Lambda expects 'email' field
                password,
            });

            if (response.data.access_token) {
                localStorage.setItem('access_token', response.data.access_token);
                localStorage.setItem('refresh_token', response.data.refresh_token);
                setIsLoggedIn(true);
                toast.success('Welcome back to TrackMania!');
                navigate('/');
            }
        } catch (error: unknown) {
            console.error('Login error:', error);

            // Handle different error types
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { status?: number; data?: { msg?: string } } };

                if (axiosError.response?.status === 429) {
                    toast.error('Too many login attempts. Please wait 5 minutes before trying again.');
                } else if (axiosError.response?.status === 401) {
                    toast.error('Invalid credentials. Please check your username and password.');
                } else if (axiosError.response?.data?.msg) {
                    toast.error(axiosError.response.data.msg);
                } else {
                    toast.error('Login failed. Please try again.');
                }
            } else {
                toast.error('Login failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="racing-card text-center">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-8">
                        <div className="p-4 bg-gradient-to-br from-primary to-secondary-bright rounded-2xl shadow-glow">
                            <LogIn className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold mb-2">
                        <span className="bg-gradient-to-r from-primary to-secondary-bright bg-clip-text text-transparent">
                            Welcome Back
                        </span>
                    </h1>
                    <p className="text-muted-foreground mb-8">
                        Log in to access your TrackMania records
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    required
                                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                />
                            </div>

                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    required
                                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-racing w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    Log In
                                    <ArrowRight size={20} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-border/50">
                        <p className="text-muted-foreground">
                            Don't have an account?{' '}
                            <Link
                                to="/register"
                                className="text-primary hover:text-primary-glow font-medium transition-colors duration-300"
                            >
                                Sign up here
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;