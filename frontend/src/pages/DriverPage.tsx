import React, { useState, useEffect } from 'react';
import { User, Trophy, Plus, Trash2, Target, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

interface DriverNotification {
    id: string;
    mapName: string;
    mapId: string;
    currentRecord: number;
    yourTime: number;
    recordHolder: string;
    isActive: boolean;
    createdAt: string;
    lastChecked?: string;
}

const DriverPage: React.FC = () => {
    const [notifications, setNotifications] = useState<DriverNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newNotification, setNewNotification] = useState({
        mapId: '',
        yourTime: ''
    });

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            // Replace with your actual API endpoint
            const response = await axios.get('/api/v1/users/create_alert', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setNotifications(response.data.notifications || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
            toast.error('Failed to load driver notifications');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddNotification = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await axios.post('/api/v1/users/create_alert',
                {
                    mapId: newNotification.mapId,
                    yourTime: parseFloat(newNotification.yourTime) * 1000 // Convert to milliseconds
                },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );

            if (response.data.success) {
                toast.success('Driver notification added successfully!');
                setNewNotification({ mapId: '', yourTime: '' });
                setShowAddForm(false);
                fetchNotifications();
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to add notification');
        }
    };

    const handleDeleteNotification = async (notificationId: string) => {
        try {
            await axios.delete(`/api/v1/users/create_alert/${notificationId}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });

            toast.success('Notification deleted successfully!');
            fetchNotifications();
        } catch (error) {
            toast.error('Failed to delete notification');
        }
    };

    const formatTime = (milliseconds: number): string => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        const ms = milliseconds % 1000;
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const getStatus = (notification: DriverNotification) => {
        if (notification.yourTime <= notification.currentRecord) {
            return { status: 'leading', color: 'from-secondary-bright to-secondary-bright-glow', text: 'You hold the record!' };
        } else {
            const diff = notification.yourTime - notification.currentRecord;
            return {
                status: 'behind',
                color: 'from-destructive to-destructive/80',
                text: `Behind by ${formatTime(diff)}`
            };
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="racing-card text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading your notifications...</p>
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
                        <div className="p-3 bg-gradient-to-br from-primary to-secondary-bright rounded-xl shadow-glow">
                            <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Driver Notifications</h1>
                            <p className="text-muted-foreground">Track when your records get beaten</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowAddForm(true)}
                        className="btn-racing flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Add Notification
                    </button>
                </div>

                {/* Add Notification Form */}
                {showAddForm && (
                    <div className="racing-card mb-8">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            Add Driver Notification
                        </h2>

                        <form onSubmit={handleAddNotification} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                    <input
                                        type="text"
                                        value={newNotification.mapId}
                                        onChange={(e) => setNewNotification({ ...newNotification, mapId: e.target.value })}
                                        placeholder="Map ID"
                                        required
                                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    />
                                </div>

                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={newNotification.yourTime}
                                        onChange={(e) => setNewNotification({ ...newNotification, yourTime: e.target.value })}
                                        placeholder="Your time (seconds, e.g., 45.123)"
                                        required
                                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    type="submit"
                                    className="btn-racing"
                                >
                                    Add Notification
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="px-6 py-3 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Notifications List */}
                <div className="space-y-4">
                    {notifications.length === 0 ? (
                        <div className="racing-card text-center py-12">
                            <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">No notifications set</h3>
                            <p className="text-muted-foreground mb-6">
                                Add your first driver notification to get alerted when your records are beaten
                            </p>
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="btn-racing flex items-center gap-2 mx-auto"
                            >
                                <Plus size={20} />
                                Add Your First Notification
                            </button>
                        </div>
                    ) : (
                        notifications.map((notification) => {
                            const statusInfo = getStatus(notification);

                            return (
                                <div key={notification.id} className="racing-card">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className={`p-3 rounded-xl bg-gradient-to-br ${statusInfo.color}`}>
                                                {statusInfo.status === 'leading' ? (
                                                    <Trophy className="w-5 h-5 text-white" />
                                                ) : (
                                                    <Target className="w-5 h-5 text-white" />
                                                )}
                                            </div>

                                            <div className="flex-1">
                                                <h3 className="font-semibold text-foreground mb-1">
                                                    {notification.mapName || `Map ${notification.mapId}`}
                                                </h3>

                                                <div className="flex items-center gap-6 text-sm text-muted-foreground mb-2">
                                                    <span>Map ID: {notification.mapId}</span>
                                                    <span>Created: {new Date(notification.createdAt).toLocaleDateString()}</span>
                                                    {notification.lastChecked && (
                                                        <span>Last checked: {new Date(notification.lastChecked).toLocaleDateString()}</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-4 text-sm">
                                                    <span className="text-foreground">
                                                        Your time: <strong>{formatTime(notification.yourTime)}</strong>
                                                    </span>
                                                    <span className="text-foreground">
                                                        Current WR: <strong>{formatTime(notification.currentRecord)}</strong>
                                                    </span>
                                                    <span className="text-foreground">
                                                        by <strong>{notification.recordHolder}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${statusInfo.color} text-white`}>
                                                {statusInfo.text}
                                            </div>

                                            <button
                                                onClick={() => handleDeleteNotification(notification.id)}
                                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-300"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default DriverPage;