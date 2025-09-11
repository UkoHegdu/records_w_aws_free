import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, MapPin, Clock, User, Search, Mail } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../auth';

interface Alert {
    id: string;
    mapName: string;
    mapId: string;
    createdAt: string;
    lastTriggered?: string;
    isActive: boolean;
}

const MapperAlerts: React.FC = () => {
    // Original functionality states
    const [usernameQuery, setUsernameQuery] = useState('');
    const [matchedUsers, setMatchedUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);

    // New functionality states
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMapId, setNewMapId] = useState('');
    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

    useEffect(() => {
        fetchAlerts();
    }, []);

    // Original functionality functions
    const handleUsernameSearch = async () => {
        try {
            const res = await apiClient.get(
                `/api/v1/users/search?username=${usernameQuery}`
            );
            setMatchedUsers(res.data.map((u: { Name: string }) => u.Name));
        } catch (err) {
            setMatchedUsers([]);
            toast.error('Failed to search users');
        }
    };

    const handleUserSelect = (username: string) => {
        setSelectedUser(username);
        setSubmitted(false);
    };

    const handleCreateAlert = async () => {
        if (!selectedUser || !email) {
            toast.error('Please select a user and enter your email');
            return;
        }
        try {
            await apiClient.post(`/api/v1/users/create_alert`, {
                username: selectedUser,
                email,
            });
            setSubmitted(true);
            toast.success('Alert created successfully!');
            // Reset form
            setUsernameQuery('');
            setMatchedUsers([]);
            setSelectedUser(null);
            setEmail('');
        } catch (err) {
            console.error('Failed to create alert:', err);
            toast.error('Failed to create alert');
        }
    };

    const fetchAlerts = async () => {
        try {
            // Debug: Check if user is logged in
            const token = localStorage.getItem('access_token');
            console.log('🔐 Access token present:', !!token);
            console.log('🔐 Token preview:', token ? token.substring(0, 20) + '...' : 'No token');

            const response = await apiClient.get('/api/v1/users/create_alert');
            setAlerts(response.data.alerts || []);
        } catch (error: any) {
            console.error('Error fetching alerts:', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);

            if (error.response?.status === 401) {
                toast.error('Please log in to view alerts');
            } else {
                toast.error('Failed to load alerts');
            }
        } finally {
            setIsLoading(false);
        }
    };


    const handleAddAlert = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await apiClient.post('/api/v1/users/create_alert',
                { mapId: newMapId }
            );

            if (response.data.success) {
                toast.success('Alert added successfully!');
                setNewMapId('');
                setShowAddForm(false);
                fetchAlerts();
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to add alert');
        }
    };

    const handleDeleteAlert = async (alertId: string) => {
        const confirmed = window.confirm(
            'Are you sure? You will not receive any notifications about your maps anymore.'
        );

        if (!confirmed) return;

        try {
            await apiClient.delete(`/api/v1/users/create_alert/${alertId}`);
            toast.success('Alert deleted successfully!');
            fetchAlerts();
        } catch (error) {
            toast.error('Failed to delete alert');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="racing-card text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading your alerts...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-primary to-primary-glow rounded-xl shadow-glow">
                            <Bell className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Mapper Alerts</h1>
                            <p className="text-muted-foreground">Get notified when someone drives your maps</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${activeTab === 'create'
                            ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                    >
                        <Bell className="w-4 h-4 inline mr-2" />
                        Create Alert
                    </button>
                    <button
                        onClick={() => setActiveTab('manage')}
                        className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${activeTab === 'manage'
                            ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                    >
                        <User className="w-4 h-4 inline mr-2" />
                        Manage Alerts
                    </button>
                </div>

                {/* Create Alert Tab */}
                {activeTab === 'create' && (
                    <div className="space-y-6">
                        <div className="racing-card">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Bell className="w-5 h-5" />
                                Set up a mapper alert
                            </h2>

                            {/* Username Search */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        🔍 First, pick your username
                                    </label>
                                    <div className="flex gap-4">
                                        <div className="flex-1 relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                            <input
                                                type="text"
                                                value={usernameQuery}
                                                onChange={(e) => setUsernameQuery(e.target.value)}
                                                placeholder="Enter your TrackMania username"
                                                className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                            />
                                        </div>
                                        <button
                                            onClick={handleUsernameSearch}
                                            className="btn-racing flex items-center gap-2"
                                        >
                                            <Search size={20} />
                                            Search
                                        </button>
                                    </div>
                                </div>

                                {/* User Selection */}
                                {matchedUsers.length > 0 && (
                                    <div className="racing-card">
                                        <h3 className="text-lg font-semibold mb-4">Please select a user:</h3>
                                        <div className="grid gap-2">
                                            {matchedUsers.map((user) => (
                                                <button
                                                    key={user}
                                                    onClick={() => handleUserSelect(user)}
                                                    className={`p-3 rounded-xl text-left transition-all duration-300 ${selectedUser === user
                                                        ? 'bg-gradient-to-r from-primary/20 to-secondary-bright/20 text-primary border border-primary/30'
                                                        : 'bg-muted hover:bg-muted/80 text-foreground'
                                                        }`}
                                                >
                                                    <User className="w-4 h-4 inline mr-2" />
                                                    {user}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Email Input */}
                                {selectedUser && (
                                    <div className="racing-card">
                                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                            <Mail className="w-5 h-5" />
                                            📧 Enter your e-mail to get alerts for {selectedUser}
                                        </h3>
                                        <div className="flex gap-4">
                                            <div className="flex-1 relative">
                                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="Enter your email address"
                                                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                                />
                                            </div>
                                            <button
                                                onClick={handleCreateAlert}
                                                className="btn-racing flex items-center gap-2"
                                            >
                                                <Bell size={20} />
                                                Send me (daily) alerts for my maps
                                            </button>
                                        </div>
                                        {submitted && (
                                            <div className="mt-4 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400">
                                                ✅ You're subscribed for alerts!
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Manage Alerts Tab */}
                {activeTab === 'manage' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">Your Active Alerts</h2>
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="btn-racing flex items-center gap-2"
                            >
                                <Plus size={20} />
                                Add Alert
                            </button>
                        </div>

                        {/* Add Alert Form */}
                        {showAddForm && (
                            <div className="racing-card mb-8">
                                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                    <Plus className="w-5 h-5" />
                                    Add New Alert
                                </h2>

                                <form onSubmit={handleAddAlert} className="flex gap-4">
                                    <div className="flex-1 relative">
                                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                        <input
                                            type="text"
                                            value={newMapId}
                                            onChange={(e) => setNewMapId(e.target.value)}
                                            placeholder="Enter Map ID"
                                            required
                                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn-racing"
                                    >
                                        Add Alert
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowAddForm(false)}
                                        className="px-6 py-3 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* Alerts List */}
                        <div className="space-y-4">
                            {alerts.length === 0 ? (
                                <div className="racing-card text-center py-12">
                                    <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold mb-2">No alerts yet</h3>
                                    <p className="text-muted-foreground mb-6">
                                        Add your first map alert to get notifications when someone drives your maps
                                    </p>
                                    <button
                                        onClick={() => setShowAddForm(true)}
                                        className="btn-racing flex items-center gap-2 mx-auto"
                                    >
                                        <Plus size={20} />
                                        Add Your First Alert
                                    </button>
                                </div>
                            ) : (
                                alerts.map((alert) => (
                                    <div key={alert.id} className="racing-card">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-xl ${alert.isActive ? 'bg-gradient-to-br from-primary to-primary-glow shadow-glow' : 'bg-muted'}`}>
                                                    <MapPin className="w-5 h-5 text-white" />
                                                </div>

                                                <div>
                                                    <h3 className="font-semibold text-foreground">
                                                        {alert.mapName || `Map ${alert.mapId}`}
                                                    </h3>
                                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={14} />
                                                            Created {new Date(alert.createdAt).toLocaleDateString()}
                                                        </span>
                                                        {alert.lastTriggered && (
                                                            <span className="flex items-center gap-1">
                                                                <User size={14} />
                                                                Last triggered {new Date(alert.lastTriggered).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className={`px-3 py-1 rounded-full text-xs font-medium ${alert.isActive
                                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                                    : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {alert.isActive ? 'Active' : 'Inactive'}
                                                </div>

                                                <button
                                                    onClick={() => handleDeleteAlert(alert.id)}
                                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-300"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapperAlerts;