import React, { useState, useEffect } from 'react';
import { MessageSquare, Users, Bell, MapPin, TrendingUp, Send, Calendar, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../auth';

interface SiteStats {
    total_users: number;
    total_alerts_sent: number;
    total_driver_notifications: number;
}

interface NewsArticle {
    id: number;
    title: string;
    content: string;
    date: string;
    type: 'update' | 'feature' | 'announcement';
}

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<SiteStats>({
        total_users: 0,
        total_alerts_sent: 0,
        total_driver_notifications: 0
    });
    const [feedback, setFeedback] = useState('');
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);

    // Mock news articles for now
    const newsArticles: NewsArticle[] = [
        {
            id: 1,
            title: "Version 1.1 Deployed",
            content: "We've launched version 1.1 with improved admin controls, driver notifications, and smart alert system. The new two-phase processing makes everything faster and more reliable.",
            date: "2025-09-17",
            type: "update"
        },
        {
            id: 2,
            title: "New Dashboard Experience",
            content: "Welcome to your new dashboard! Here you can see site statistics, latest news, and send feedback directly to our team. We're constantly improving based on your input.",
            date: "2025-09-17",
            type: "feature"
        }
    ];

    useEffect(() => {
        loadSiteStats();
    }, []);

    const loadSiteStats = async () => {
        try {
            setStatsLoading(true);
            const response = await apiClient.get('/api/v1/admin/daily-overview');
            setStats(response.data.site_stats);
        } catch (error) {
            console.error('Error loading site stats:', error);
            // Use mock data if API fails
            setStats({
                total_users: 42,
                total_alerts_sent: 128,
                total_driver_notifications: 67
            });
        } finally {
            setStatsLoading(false);
        }
    };

    const handleFeedbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedback.trim()) {
            toast.error('Please enter your feedback');
            return;
        }

        try {
            setFeedbackLoading(true);
            await apiClient.post('/api/v1/feedback', {
                message: feedback.trim(),
                type: 'general'
            });

            toast.success('Thank you for your feedback! We appreciate your input.');
            setFeedback('');
        } catch (error) {
            console.error('Error submitting feedback:', error);
            toast.error('Failed to submit feedback. Please try again.');
        } finally {
            setFeedbackLoading(false);
        }
    };

    const getNewsIcon = (type: string) => {
        switch (type) {
            case 'update': return <TrendingUp className="w-5 h-5 text-blue-500" />;
            case 'feature': return <BarChart3 className="w-5 h-5 text-green-500" />;
            case 'announcement': return <Calendar className="w-5 h-5 text-purple-500" />;
            default: return <Calendar className="w-5 h-5 text-gray-500" />;
        }
    };

    const getNewsTypeColor = (type: string) => {
        switch (type) {
            case 'update': return 'bg-blue-900 text-blue-200';
            case 'feature': return 'bg-green-900 text-green-200';
            case 'announcement': return 'bg-purple-900 text-purple-200';
            default: return 'bg-gray-900 text-gray-200';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
                    <p className="text-slate-300">Welcome back! Here's what's happening with your TrackMania community.</p>
                </div>

                {/* News Section */}
                <div className="racing-card mb-8">
                    <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-primary" />
                        Site News
                    </h2>

                    <div className="space-y-6">
                        {newsArticles.map((article) => (
                            <div key={article.id} className="border border-border rounded-lg p-6 hover:bg-muted/50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                        {getNewsIcon(article.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-xl font-semibold text-foreground">
                                                {article.title}
                                            </h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getNewsTypeColor(article.type)}`}>
                                                {article.type}
                                            </span>
                                        </div>
                                        <p className="text-muted-foreground mb-3">
                                            {article.content}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(article.date).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>
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
                                <div className="text-3xl font-bold text-blue-500 mb-1">{stats.total_users}</div>
                                <div className="text-sm text-muted-foreground">Registered Users</div>
                            </div>

                            <div className="text-center p-6 bg-gradient-to-br from-green-500/10 to-green-600/10 rounded-xl border border-green-500/20">
                                <Bell className="w-8 h-8 text-green-500 mx-auto mb-3" />
                                <div className="text-3xl font-bold text-green-500 mb-1">{stats.total_alerts_sent}</div>
                                <div className="text-sm text-muted-foreground">Alerts Sent</div>
                            </div>

                            <div className="text-center p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-xl border border-purple-500/20">
                                <MapPin className="w-8 h-8 text-purple-500 mx-auto mb-3" />
                                <div className="text-3xl font-bold text-purple-500 mb-1">{stats.total_driver_notifications}</div>
                                <div className="text-sm text-muted-foreground">Driver Notifications</div>
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
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={feedbackLoading || !feedback.trim()}
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
    );
};

export default Dashboard;
