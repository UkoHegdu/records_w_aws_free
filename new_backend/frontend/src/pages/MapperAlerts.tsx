import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, MapPin, Clock, User, Settings, Info } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../auth';

interface Alert {
    id: string;
    mapName: string;
    mapId: string;
    createdAt: string;
    lastTriggered?: string;
    isActive: boolean;
    recordFilter?: 'top5' | 'wr' | 'all';
}

interface UserProfile {
    id: string;
    email: string;
    username: string;
    createdAt: string;
}

interface NotificationHistory {
    date: string;
    mapper_alert: {
        status: string;
        message: string;
        records_found: number;
        created_at: string;
    } | null;
    driver_notification: {
        status: string;
        message: string;
        records_found: number;
        created_at: string;
    } | null;
}

const MapperAlerts: React.FC = () => {
    // State variables
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMapId, setNewMapId] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'manage'>('manage');
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [showAddAlertModal, setShowAddAlertModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [alertToDelete, setAlertToDelete] = useState<string | null>(null);
    const [userLoginInfo, setUserLoginInfo] = useState<{ username: string, email: string } | null>(null);
    const [notificationHistory, setNotificationHistory] = useState<NotificationHistory[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [isCreatingAlert, setIsCreatingAlert] = useState(false);
    const [newAlertRecordFilter, setNewAlertRecordFilter] = useState<'top5' | 'wr' | 'all'>('top5');

    const fetchUserLoginInfo = async () => {
        try {
            const response = await apiClient.get('/api/v1/users/profile');
            setUserLoginInfo({
                username: response.data.username,
                email: response.data.email
            });
        } catch (error) {
            console.error('Error fetching user login info:', error);
        }
    };

    const fetchNotificationHistory = async () => {
        try {
            setHistoryLoading(true);
            const response = await apiClient.get('/api/v1/notification-history');
            setNotificationHistory(response.data.history);
        } catch (error) {
            console.error('Error fetching notification history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchAlerts = useCallback(async () => {
        try {
            // Debug: Check if user is logged in
            const token = localStorage.getItem('access_token');
            console.log('🔐 Access token present:', !!token);
            console.log('🔐 Token preview:', token ? token.substring(0, 20) + '...' : 'No token');

            const response = await apiClient.get('/api/v1/users/alerts');
            const alertsData = response.data.alerts || [];
            setAlerts(alertsData);

            // Extract username from alerts data if available
            if (alertsData.length > 0 && !userProfile) {
                const firstAlert = alertsData[0];
                // mapName format: "username's map alerts"
                const username = firstAlert.mapName?.replace(/'s map alerts$/, '') || 'your';
                setUserProfile({
                    id: '1',
                    email: '',
                    username: username,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (error: unknown) {
            console.error('Error fetching alerts:', error);
            console.error('Error response:', (error as { response?: { data?: unknown } })?.response?.data);
            console.error('Error status:', (error as { response?: { status?: number } })?.response?.status);

            if ((error as { response?: { status?: number } })?.response?.status === 401) {
                toast.error('Please log in to view alerts');
            } else {
                toast.error('Failed to load alerts');
            }
        } finally {
            setIsLoading(false);
        }
    }, [userProfile]);

    useEffect(() => {
        fetchAlerts();
        fetchUserLoginInfo();
    }, [fetchAlerts]);

    // Only fetch notification history if user has alerts
    useEffect(() => {
        if (alerts.length > 0) {
            fetchNotificationHistory();
        } else {
            // Clear notification history if no alerts
            setNotificationHistory([]);
        }
    }, [alerts.length]);

    const handleAddAlert = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await apiClient.post('/api/v1/users/alerts',
                {}
            );

            if (response.data.success) {
                toast.success('Alert added successfully!');
                setNewMapId('');
                setShowAddForm(false);
                fetchAlerts();
            }
        } catch (error: unknown) {
            toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add alert');
        }
    };

    const handleDeleteAlert = (alertId: string) => {
        setAlertToDelete(alertId);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!alertToDelete) return;

        try {
            await apiClient.delete(`/api/v1/users/alerts/${alertToDelete}`);
            toast.success('Alert deleted successfully!');
            fetchAlerts();
            setShowDeleteModal(false);
            setAlertToDelete(null);
        } catch {
            toast.error('Failed to delete alert');
        }
    };






    const handleCancelDelete = () => {
        setShowDeleteModal(false);
        setAlertToDelete(null);
    };

    const handleAddAlertClick = () => {
        setNewAlertRecordFilter('top5');
        setShowAddAlertModal(true);
    };

    const handleConfirmAddAlert = async () => {
        if (isCreatingAlert) return;
        setIsCreatingAlert(true);
        try {
            const response = await apiClient.post('/api/v1/users/alerts', {
                MapCount: 0,
                alert_type: 'accurate', // Backend creates instantly; map count is updated in background
                record_filter: newAlertRecordFilter
            });

            if (response.data.auto_switched) {
                toast.warning('Due to the large number of maps, your alert has been set to "Inaccurate" mode. You will only see notifications when new players drive your maps, not when existing players improve their times.');
            } else {
                toast.success('Alert created successfully!');
            }

            setShowAddAlertModal(false);
            fetchAlerts();
        } catch (error: unknown) {
            toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create alert');
        } finally {
            setIsCreatingAlert(false);
        }
    };

    const handleCancelAddAlert = () => {
        setShowAddAlertModal(false);
    };

    const updateAlertRecordFilter = async (alertId: string, nextFilter: 'top5' | 'wr' | 'all') => {
        const prevAlerts = alerts;
        setAlerts((current) => current.map(a => a.id === alertId ? { ...a, recordFilter: nextFilter } : a));
        try {
            await apiClient.put(`/api/v1/users/alerts/${alertId}`, { record_filter: nextFilter });
            toast.success('Alert filter updated');
        } catch (error) {
            console.error('Error updating alert filter:', error);
            setAlerts(prevAlerts);
            toast.error('Failed to update alert filter');
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
                    <div className="flex gap-3">
                        <button
                            onClick={() => setActiveTab('info')}
                            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'info'
                                ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Info className="w-4 h-4" />
                            Alert Info
                        </button>
                        <button
                            onClick={() => setActiveTab('manage')}
                            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'manage'
                                ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Settings className="w-4 h-4" />
                            Manage Alerts
                        </button>
                    </div>
                </div>


                {/* Alert Info Tab */}
                {activeTab === 'info' && (
                    <div className="space-y-6">
                        <div className="racing-card">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Info className="w-5 h-5" />
                                Alert Information
                            </h2>
                            <div className="space-y-4">
                                <p className="text-muted-foreground">
                                    When you add an alert, it gets triggered once per day. It will fetch your username from trackmania exchange and go through all of your created maps and fetch new times driven in the past 24 hours. If any new times are found, you will get a notification email.
                                </p>

                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h3 className="font-semibold mb-2">How it works:</h3>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• Daily checks at 5am UTC</li>
                                        <li>• Email notifications for new records</li>
                                        <li>• Track all your published maps</li>
                                        <li>• Manage alerts from the Manage Alerts tab</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Manage Alerts Tab */}
                {activeTab === 'manage' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">Your Active Alerts</h2>
                            {alerts.length === 0 && (
                                <button
                                    onClick={handleAddAlertClick}
                                    className="btn-racing flex items-center gap-2"
                                >
                                    <Plus size={20} />
                                    Add Alert
                                </button>
                            )}
                        </div>

                        {/* User Login Info Display */}
                        {userLoginInfo && (
                            <div className="racing-card border-border/50 bg-muted/5">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                                        <User className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-foreground mb-1">Account Information</h3>
                                        <div className="text-sm text-foreground">
                                            <p className="text-green-600 font-medium">✓ Logged in as: <strong>{userLoginInfo.username}</strong></p>
                                            <p className="text-muted-foreground text-xs mt-1">Email: {userLoginInfo.email}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

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
                                    <p className="text-muted-foreground mb-4">
                                        Add your first map alert to get notifications when someone drives your maps
                                    </p>
                                    <p className="text-sm text-muted-foreground mb-6">
                                        Once you add an alert, you'll see your notification history here showing when alerts were processed and if any new records were found.
                                    </p>
                                    <button
                                        onClick={handleAddAlertClick}
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
                                                <div className="hidden sm:flex items-center gap-2 mr-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            updateAlertRecordFilter(alert.id, 'top5');
                                                        }}
                                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'top5')
                                                            ? 'bg-primary/20 text-primary border-primary/30'
                                                            : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                            }`}
                                                        aria-pressed={((alert.recordFilter || 'top5') === 'top5')}
                                                    >
                                                        Top 5 only
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            updateAlertRecordFilter(alert.id, 'wr');
                                                        }}
                                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'wr')
                                                            ? 'bg-primary/20 text-primary border-primary/30'
                                                            : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                            }`}
                                                        aria-pressed={((alert.recordFilter || 'top5') === 'wr')}
                                                    >
                                                        WR only
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateAlertRecordFilter(alert.id, 'all')}
                                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'all')
                                                            ? 'bg-primary/20 text-primary border-primary/30'
                                                            : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                            }`}
                                                        aria-pressed={((alert.recordFilter || 'top5') === 'all')}
                                                    >
                                                        All times
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={() => handleDeleteAlert(alert.id)}
                                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-300"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="sm:hidden mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAlertRecordFilter(alert.id, 'top5');
                                                }}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'top5')
                                                    ? 'bg-primary/20 text-primary border-primary/30'
                                                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                    }`}
                                                aria-pressed={((alert.recordFilter || 'top5') === 'top5')}
                                            >
                                                Top 5 only
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAlertRecordFilter(alert.id, 'wr');
                                                }}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'wr')
                                                    ? 'bg-primary/20 text-primary border-primary/30'
                                                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                    }`}
                                                aria-pressed={((alert.recordFilter || 'top5') === 'wr')}
                                            >
                                                WR only
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateAlertRecordFilter(alert.id, 'all')}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${((alert.recordFilter || 'top5') === 'all')
                                                    ? 'bg-primary/20 text-primary border-primary/30'
                                                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                                    }`}
                                                aria-pressed={((alert.recordFilter || 'top5') === 'all')}
                                            >
                                                All times
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Notification History - Only show if user has alerts */}
                        {alerts.length > 0 && (
                            <div className="racing-card">
                                <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                                    <Clock className="w-5 h-5" />
                                    Notification History (Last 5 Days)
                                </h2>

                                {historyLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {notificationHistory.map((day, index) => (
                                            <div key={day.date} className="border border-border rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h3 className="font-medium text-foreground">
                                                        {new Date(day.date).toLocaleDateString('en-US', {
                                                            weekday: 'long',
                                                            year: 'numeric',
                                                            month: 'long',
                                                            day: 'numeric'
                                                        })}
                                                    </h3>
                                                    <span className="text-xs text-muted-foreground">
                                                        {index === 0 ? 'Today' : index === 1 ? 'Yesterday' : `${index} days ago`}
                                                    </span>
                                                </div>

                                                <div className="space-y-4">
                                                    {/* Mapper Alerts */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                                                            <Bell className="w-4 h-4" />
                                                            Mapper Alerts
                                                        </h4>
                                                        {day.mapper_alert ? (
                                                            <div className={`p-3 rounded-lg text-sm ${day.mapper_alert.status === 'sent'
                                                                ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800'
                                                                : day.mapper_alert.status === 'no_new_times'
                                                                    ? 'bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700'
                                                                    : 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
                                                                }`}>
                                                                <p className={`font-medium ${day.mapper_alert.status === 'sent'
                                                                    ? 'text-green-800 dark:text-green-200'
                                                                    : day.mapper_alert.status === 'no_new_times'
                                                                        ? 'text-gray-700 dark:text-gray-300'
                                                                        : 'text-red-800 dark:text-red-200'
                                                                    }`}>
                                                                    {day.mapper_alert.status === 'sent' ? 'Success' : day.mapper_alert.status === 'no_new_times' ? 'No new records' : 'Failed'}
                                                                </p>
                                                                {day.mapper_alert.records_found > 0 && (
                                                                    <p className="text-xs text-muted-foreground mt-1">
                                                                        {day.mapper_alert.records_found} records found
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-muted-foreground italic">
                                                                No processing data
                                                            </div>
                                                        )}
                                                    </div>

                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}


                {/* Add Alert Modal */}
                {showAddAlertModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gradient-to-br from-primary to-primary-glow rounded-lg">
                                    <Bell className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-semibold">Add Alert</h2>
                            </div>
                            <div className="space-y-4 mb-6">
                                <p className="text-muted-foreground">
                                    Alerts for new times in <strong>your</strong> maps will be sent out daily at 5am UTC.
                                </p>
                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h3 className="font-semibold mb-2">What times should be included?</h3>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="recordFilter"
                                                value="top5"
                                                checked={newAlertRecordFilter === 'top5'}
                                                onChange={() => setNewAlertRecordFilter('top5')}
                                            />
                                            Top five times (default)
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="recordFilter"
                                                value="wr"
                                                checked={newAlertRecordFilter === 'wr'}
                                                onChange={() => setNewAlertRecordFilter('wr')}
                                            />
                                            World record only
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="recordFilter"
                                                value="all"
                                                checked={newAlertRecordFilter === 'all'}
                                                onChange={() => setNewAlertRecordFilter('all')}
                                            />
                                            All times
                                        </label>
                                    </div>
                                </div>
                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h3 className="font-semibold mb-2">What you'll receive:</h3>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• Email notifications for new records</li>
                                        <li>• Daily summary of activity</li>
                                        <li>• Map details and record times</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleCancelAddAlert}
                                    disabled={isCreatingAlert}
                                    className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmAddAlert}
                                    disabled={isCreatingAlert}
                                    className="flex-1 btn-racing flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isCreatingAlert ? (
                                        <>
                                            <span className="inline-block w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                            Creating…
                                        </>
                                    ) : (
                                        'OK'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
                                    <Trash2 className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-semibold">Delete Alert</h2>
                            </div>
                            <div className="space-y-4 mb-6">
                                <p className="text-muted-foreground">
                                    Are you sure you want to delete this alert? You will not receive any notifications about your maps anymore.
                                </p>
                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h3 className="font-semibold mb-2">This action will:</h3>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• Stop all email notifications for your maps</li>
                                        <li>• Remove the alert permanently</li>
                                        <li>• Cannot be undone</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCancelDelete}
                                    className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    className="flex-1 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors duration-300"
                                >
                                    Delete Alert
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default MapperAlerts;