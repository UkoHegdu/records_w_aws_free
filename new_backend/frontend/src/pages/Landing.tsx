import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Bell, Trophy, User, ArrowRight, Zap, MessageSquare, Users, Send, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../auth';

interface LandingProps {
    isLoggedIn?: boolean;
}

const Landing: React.FC<LandingProps> = ({ isLoggedIn: isLoggedInProp }) => {
    const [localLoggedIn, setLocalLoggedIn] = useState(false);
    const isLoggedIn = isLoggedInProp !== undefined ? isLoggedInProp : localLoggedIn;
    const [stats, setStats] = useState({
        total_users: 0,
        total_alerts_sent: 0,
        maps_being_watched: 0
    });
    const [feedback, setFeedback] = useState('');
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);

    const featureDescriptions = [
        {
            title: "Mapper Alerts",
            icon: Bell,
            description: "Add maps you created and get notified when someone drives them. You can add multiple maps, manage alerts per map, and view notification history."
        },
        {
            title: "Driver Notifications",
            icon: MapPin,
            description: "Add maps where you hold a top 5 time and get notified when someone beats your time. Track your position and personal best. Notifications are sent when your record is beaten."
        }
    ];

    useEffect(() => {
        if (isLoggedInProp === undefined) {
            const token = localStorage.getItem('access_token');
            setLocalLoggedIn(!!token);
        }
        loadSiteStats();
    }, [isLoggedInProp]);

    const loadSiteStats = async () => {
        const cached = sessionStorage.getItem('site_stats');
        if (cached) {
            try {
                const siteStats = JSON.parse(cached);
                if (siteStats && typeof siteStats === 'object') {
                    setStats({
                        total_users: siteStats.total_users ?? 0,
                        total_alerts_sent: siteStats.total_alerts_sent ?? 0,
                        maps_being_watched: siteStats.maps_being_watched ?? 0
                    });
                    setStatsLoading(false);
                    return;
                }
            } catch {
                // invalid cache, fall through to fetch
            }
        }

        try {
            setStatsLoading(true);
            const response = await apiClient.get('/api/v1/stats');
            const siteStats = response.data;
            if (siteStats && typeof siteStats === 'object') {
                const data = {
                    total_users: siteStats.total_users ?? 0,
                    total_alerts_sent: siteStats.total_alerts_sent ?? 0,
                    maps_being_watched: siteStats.maps_being_watched ?? 0
                };
                setStats(data);
                sessionStorage.setItem('site_stats', JSON.stringify(data));
            }
        } catch (error) {
            console.error('Error loading site stats:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const handleFeedbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedFeedback = feedback.trim();

        if (!trimmedFeedback) {
            toast.error('Please enter your feedback');
            return;
        }

        if (trimmedFeedback.length < 10) {
            toast.error('Feedback must be at least 10 characters long');
            return;
        }

        try {
            setFeedbackLoading(true);
            await apiClient.post('/api/v1/feedback', {
                message: trimmedFeedback,
                type: 'general'
            });

            toast.success('Thank you for your feedback! We appreciate your input.');
            setFeedback('');
        } catch (error: unknown) {
            console.error('Error submitting feedback:', error);

            // Handle specific error cases
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { status?: number; data?: { error?: string } } };
                if (axiosError.response?.status === 429) {
                    toast.error('Rate limit exceeded. Please wait before submitting more feedback.');
                } else if (axiosError.response?.status === 503) {
                    toast.error(axiosError.response.data?.error || 'Feedback submission is temporarily unavailable. Please try again later.');
                } else if (axiosError.response?.status === 400) {
                    toast.error(axiosError.response.data?.error || 'Invalid feedback. Please check your message and try again.');
                } else {
                    toast.error('Failed to submit feedback. Please try again.');
                }
            } else {
                toast.error('Failed to submit feedback. Please try again.');
            }
        } finally {
            setFeedbackLoading(false);
        }
    };

    const features = [
        {
            icon: Bell,
            title: "Mapper Alerts",
            description: "Set and manage alerts for when someone drives one of your maps. Never miss a reaction again!",
            color: "from-primary to-primary-glow"
        },
        {
            icon: Trophy,
            title: "Newest Records",
            description: "See the newest records on your maps without setting any alerts. Stay updated effortlessly.",
            color: "from-secondary-bright to-secondary-bright-glow"
        },
        {
            icon: User,
            title: "Driver Notifications",
            description: "Get notified when someone beats your world record. Track your competitive standing.",
            color: "from-primary to-secondary"
        }
    ];

    return (
        <div className="min-h-screen">
            {isLoggedIn ? (
                // Dashboard content for logged-in users
                <div className="min-h-screen bg-gradient-to-br from-background via-card to-background p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="mb-8">
                            <h1 className="text-4xl font-bold text-foreground mb-2">Welcome Back!</h1>
                            <p className="text-muted-foreground">Here's what's happening with your TrackMania community.</p>
                        </div>

                        {/* Mapper Alerts & Driver Notifications */}
                        <div className="racing-card mb-8">
                            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                                <Bell className="w-6 h-6 text-primary" />
                                What You Can Do
                            </h2>

                            <div className="grid md:grid-cols-2 gap-6">
                                {featureDescriptions.map((item, index) => (
                                    <div key={index} className="border border-border rounded-lg p-6">
                                        <div className="flex items-center gap-3 mb-3">
                                            <item.icon className="w-6 h-6 text-primary" />
                                            <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                                        </div>
                                        <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Statistics Section */}
                        <div className="racing-card mb-8">
                            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                                <BarChart3 className="w-6 h-6 text-primary" />
                                Site Statistics
                            </h2>

                            {statsLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="text-center p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-xl border border-blue-500/20">
                                        <Users className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                                        <div className="text-3xl font-bold text-blue-500 mb-1">{stats?.total_users || 0}</div>
                                        <div className="text-sm text-muted-foreground">Registered Users</div>
                                    </div>

                                    <div className="text-center p-6 bg-gradient-to-br from-green-500/10 to-green-600/10 rounded-xl border border-green-500/20">
                                        <Bell className="w-8 h-8 text-green-500 mx-auto mb-3" />
                                        <div className="text-3xl font-bold text-green-500 mb-1">{stats?.total_alerts_sent || 0}</div>
                                        <div className="text-sm text-muted-foreground">Alerts Sent</div>
                                    </div>

                                    <div className="text-center p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-xl border border-purple-500/20">
                                        <MapPin className="w-8 h-8 text-purple-500 mx-auto mb-3" />
                                        <div className="text-3xl font-bold text-purple-500 mb-1">{stats?.maps_being_watched || 0}</div>
                                        <div className="text-sm text-muted-foreground">Maps being watched</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Feedback Section */}
                        <div className="racing-card">
                            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                                <MessageSquare className="w-6 h-6 text-primary" />
                                Send Feedback
                            </h2>

                            <div className="mb-6">
                                <p className="text-muted-foreground mb-4">
                                    Send in bug reports, ideas for new features or critique/compliments about the site.
                                    Your feedback helps us improve the platform for everyone.
                                </p>
                            </div>

                            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="feedback" className="block text-sm font-medium text-foreground mb-2">
                                        Your Feedback
                                        <span className="text-xs text-muted-foreground ml-2">
                                            (Minimum 10 characters, maximum 5 submissions per 5 minutes)
                                        </span>
                                    </label>
                                    <textarea
                                        id="feedback"
                                        value={feedback}
                                        onChange={(e) => setFeedback(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                                        placeholder="Tell us what you think, report bugs, or suggest new features..."
                                        disabled={feedbackLoading}
                                    />
                                    <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                                        <span className={feedback.trim().length < 10 && feedback.trim().length > 0 ? 'text-red-400' : ''}>
                                            {feedback.trim().length}/2000 characters
                                        </span>
                                        {feedback.trim().length > 0 && feedback.trim().length < 10 && (
                                            <span className="text-red-400">
                                                Minimum 10 characters required
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={feedbackLoading || !feedback.trim() || feedback.trim().length < 10}
                                        className="btn-racing inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {feedbackLoading ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-4 h-4" />
                                                Send Feedback
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            ) : (
                // Original landing page for non-logged-in users
                <>
                    {/* Hero Section */}
                    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
                        {/* Background Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary-bright/10" />
                        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-background/90" />

                        {/* Speed Lines Animation */}
                        <div className="absolute inset-0 speed-lines opacity-20" />

                        {/* Hero Content */}
                        <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
                            <div className="racing-glow">
                                <div className="flex items-center justify-center mb-6">
                                    <div className="p-4 bg-gradient-to-br from-primary via-primary-glow to-secondary-bright rounded-2xl shadow-glow">
                                        <MapPin className="w-12 h-12 text-white" />
                                    </div>
                                </div>

                                <h1 className="text-6xl md:text-7xl font-bold mb-6">
                                    <span className="bg-gradient-to-r from-primary via-primary-glow to-secondary-bright bg-clip-text text-transparent">
                                        TrackMania
                                    </span>
                                    <br />
                                    <span className="text-foreground">Record Tracker</span>
                                </h1>

                                <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
                                    Track who has driven your maps and who has bested your times.
                                    Never miss a streamer's reaction or a new world record again.
                                </p>

                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link
                                        to="/login"
                                        className="btn-racing inline-flex items-center gap-2 text-lg"
                                    >
                                        Log in
                                        <ArrowRight size={20} />
                                    </Link>
                                    <Link
                                        to="/register"
                                        className="btn-racing-secondary inline-flex items-center gap-2 text-lg"
                                    >
                                        <Zap size={20} />
                                        Create Account
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Features Section */}
                    <section className="py-20 px-6 bg-gradient-to-b from-background to-card/50">
                        <div className="max-w-6xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-4xl md:text-5xl font-bold mb-6">
                                    <span className="bg-gradient-to-r from-primary to-secondary-bright bg-clip-text text-transparent">
                                        Powerful Features
                                    </span>
                                </h2>
                                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                                    Everything you need to stay connected with your TrackMania community
                                </p>
                            </div>

                            <div className="grid md:grid-cols-3 gap-8">
                                {features.map((feature, index) => (
                                    <div key={index} className="racing-card group">
                                        <div className="text-center">
                                            <div className={`p-4 rounded-2xl bg-gradient-to-br ${feature.color} w-16 h-16 mx-auto mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                                <feature.icon className="w-8 h-8 text-white" />
                                            </div>

                                            <h3 className="text-2xl font-bold mb-4 text-foreground">
                                                {feature.title}
                                            </h3>

                                            <p className="text-muted-foreground leading-relaxed">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="text-center mt-16">
                                <div className="racing-card max-w-2xl mx-auto">
                                    <h3 className="text-2xl font-bold mb-4">Ready to Start Tracking?</h3>
                                    <p className="text-muted-foreground mb-6">
                                        The functionality becomes available once you log in. Join the community and never miss an important moment in TrackMania!
                                    </p>
                                    <Link
                                        to="/login"
                                        className="btn-racing inline-flex items-center gap-2"
                                    >
                                        Log In Now
                                        <ArrowRight size={20} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default Landing;