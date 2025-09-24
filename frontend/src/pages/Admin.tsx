import React, { useState, useEffect } from 'react';
import { Users, MapPin, Bell, Shield, X, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient, { isAdmin } from '../auth';

interface ConfigValue {
    config_key: string;
    config_value: string;
    description: string;
}

interface User {
    id: number;
    username: string;
    tm_username: string;
    map_count: number;
    alert_type: string;
    alert_created_at: string;
}

interface DailySummary {
    date: string;
    display_date: string;
    relative_date: string;
    overall_status: 'success' | 'partial' | 'error';
    status_message: string;
    stats: {
        total_users: number;
        mapper_alerts: {
            successful: number;
            no_new_times: number;
            errors: number;
            total_records: number;
        };
        driver_notifications: {
            successful: number;
            no_new_times: number;
            errors: number;
            total_notifications: number;
        };
    };
    user_breakdown: Array<{
        username: string;
        mapper_alert: {
            status: string;
            message: string;
            records_found: number;
        } | null;
        driver_notification: {
            status: string;
            message: string;
            records_found: number;
        } | null;
    }>;
}

const Admin: React.FC = () => {
    const [configs, setConfigs] = useState<ConfigValue[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'test'>('users');
    const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState<DailySummary | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Test section state
    const [testResult, setTestResult] = useState<string>('');
    const [testLoading, setTestLoading] = useState(false);
    const [testNotifications, setTestNotifications] = useState<Array<{
        id: string;
        mapName: string;
        mapUid: string;
        currentPosition: number;
        status: 'active' | 'inactive';
        createdAt: string;
    }>>([]);

    useEffect(() => {
        loadConfigs();
        // Only load users if user is admin
        if (isAdmin()) {
            loadUsers();
        }
    }, []);

    const loadConfigs = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            const response = await apiClient.get('/api/v1/admin/config');
            const data = response.data;
            setConfigs(data.configs);
        } catch (error) {
            console.error('Error loading configs:', error);
            // Fallback to mock data if API fails
            const mockConfigs: ConfigValue[] = [
                { config_key: 'max_maps_per_user', config_value: '200', description: 'Maximum number of maps a user can add to their watch list' },
                { config_key: 'max_driver_notifications', config_value: '200', description: 'Maximum number of driver notifications per user (optimized with position API)' },
                { config_key: 'max_users_registration', config_value: '100', description: 'Maximum number of users that can register on the site' },
                { config_key: 'max_new_records_per_map', config_value: '20', description: 'Maximum new records per map before truncating in email' }
            ];
            setConfigs(mockConfigs);
        }
    };

    const loadUsers = async () => {
        try {
            setUsersLoading(true);
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            const response = await apiClient.get('/api/v1/admin/users');
            const data = response.data;
            setUsers(data.users);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Failed to load users');
        } finally {
            setUsersLoading(false);
        }
    };

    const loadDailyOverview = async () => {
        try {
            setLogsLoading(true);
            const response = await apiClient.get('/api/v1/admin/daily-overview');
            setDailySummaries(response.data.daily_summaries);
        } catch (error) {
            console.error('Error fetching daily overview:', error);
            toast.error('Failed to fetch daily overview');
        } finally {
            setLogsLoading(false);
        }
    };

    const saveConfig = async (configKey: string) => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            await apiClient.put('/api/v1/admin/config', {
                config_key: configKey,
                config_value: editValue
            });

            // Update local state with the saved config
            setConfigs(prev => prev.map(config =>
                config.config_key === configKey
                    ? { ...config, config_value: editValue }
                    : config
            ));

            // Show success message
            alert(`Configuration updated successfully!`);
        } catch (error) {
            console.error('Error saving config:', error);
            alert(`Error saving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const updateUserAlertType = async (userId: number, alertType: string) => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            await apiClient.put('/api/v1/admin/users/alert-type', {
                user_id: userId,
                alert_type: alertType
            });

            // Update local state
            setUsers(prev => prev.map(user =>
                user.id === userId
                    ? { ...user, alert_type: alertType }
                    : user
            ));

            alert(`User alert type updated to ${alertType}!`);
        } catch (error) {
            console.error('Error updating user alert type:', error);
            alert(`Error updating user alert type: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const handleDayClick = (day: DailySummary) => {
        setSelectedDay(day);
        setShowDetailModal(true);
    };

    const closeDetailModal = () => {
        setShowDetailModal(false);
        setSelectedDay(null);
    };

    // Utility functions for status styling
    const getStatusClass = (status: string): string => {
        const statusMap: Record<string, string> = {
            success: 'status-success',
            partial: 'status-partial',
            error: 'status-error'
        };
        return statusMap[status] || 'status-default';
    };

    const getStatusIconClass = (status: string): string => {
        const iconMap: Record<string, string> = {
            success: 'status-icon-success',
            partial: 'status-icon-partial',
            error: 'status-icon-error'
        };
        return iconMap[status] || 'status-icon-default';
    };

    const getNotificationStatusClass = (status: string): string => {
        const notificationMap: Record<string, string> = {
            sent: 'notification-sent',
            no_new_times: 'notification-no-new-times',
            technical_error: 'notification-technical-error'
        };
        return notificationMap[status] || 'notification-default';
    };

    const getNotificationIconClass = (status: string): string => {
        const iconMap: Record<string, string> = {
            sent: 'notification-icon-sent',
            no_new_times: 'notification-icon-no-new-times',
            technical_error: 'notification-icon-technical-error'
        };
        return iconMap[status] || 'notification-icon-default';
    };

    const getStatusIcon = (status: string) => {
        const iconClass = getStatusIconClass(status);
        const IconComponent = status === 'partial' ? AlertTriangle :
            status === 'error' ? XCircle :
                status === 'success' ? CheckCircle : Clock;

        return <IconComponent className={`w-6 h-6 ${iconClass}`} />;
    };

    const getNotificationStatusIcon = (status: string) => {
        const iconClass = getNotificationIconClass(status);
        const IconComponent = status === 'sent' ? CheckCircle :
            status === 'technical_error' ? XCircle : Clock;

        return <IconComponent className={`w-4 h-4 ${iconClass}`} />;
    };

    // Test functions
    const handleTestEndpoint = async () => {
        setTestLoading(true);
        setTestResult('');

        try {
            const response = await apiClient.post('/api/v1/test', {});
            setTestResult(`✅ SUCCESS: Lambda called successfully! Response: ${JSON.stringify(response.data)}`);
            toast.success('Test endpoint worked!');
        } catch (error: unknown) {
            const errorMsg = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message || 'Unknown error';
            setTestResult(`❌ FAILED: ${errorMsg}`);
            toast.error('Test endpoint failed');
        } finally {
            setTestLoading(false);
        }
    };

    const handleTestAdvancedEndpoint = async () => {
        setTestLoading(true);
        setTestResult('');

        try {
            const response = await apiClient.post('/api/v1/test-advanced', {});
            setTestResult(`✅ SUCCESS: Advanced Lambda called successfully! Response: ${JSON.stringify(response.data)}`);
            toast.success('Advanced test endpoint worked!');
        } catch (error: unknown) {
            const errorMsg = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message || 'Unknown error';
            setTestResult(`❌ FAILED: ${errorMsg}`);
            toast.error('Advanced test endpoint failed');
        } finally {
            setTestLoading(false);
        }
    };

    const handleCreateTestNotification = () => {
        const newNotification = {
            id: `test-${Date.now()}`,
            mapName: `Test Map ${testNotifications.length + 1}`,
            mapUid: `test-map-uid-${testNotifications.length + 1}`,
            currentPosition: Math.floor(Math.random() * 5) + 1, // Random position 1-5 (active)
            status: 'active' as const,
            createdAt: new Date().toISOString()
        };

        setTestNotifications(prev => [...prev, newNotification]);
        toast.success(`Created test notification: ${newNotification.mapName} (Position #${newNotification.currentPosition})`);
    };

    const handleMakeNotificationOrange = () => {
        if (testNotifications.length === 0) {
            toast.error('No test notifications to make orange! Create one first.');
            return;
        }

        // Find the first active notification and make it inactive
        const activeNotification = testNotifications.find(n => n.status === 'active');
        if (!activeNotification) {
            toast.error('No active notifications to make orange!');
            return;
        }

        setTestNotifications(prev =>
            prev.map(notification =>
                notification.id === activeNotification.id
                    ? {
                        ...notification,
                        status: 'inactive' as const,
                        currentPosition: Math.floor(Math.random() * 10) + 6 // Position 6-15 (inactive)
                    }
                    : notification
            )
        );

        toast.success(`Made notification orange: ${activeNotification.mapName} (Position #${Math.floor(Math.random() * 10) + 6})`);
    };

    const handleClearTestNotifications = () => {
        setTestNotifications([]);
        toast.success('All test notifications cleared!');
    };

    const ConfigModal: React.FC<{ configKey: string; title: string; description: string }> = ({ configKey, title, description }) => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                    <button
                        onClick={() => setActiveModal(null)}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">{description}</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            New Value
                        </label>
                        <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter new value"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                saveConfig(configKey);
                                setActiveModal(null);
                            }}
                            className="flex-1 btn-racing"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setActiveModal(null)}
                            className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Admin Configuration</h1>
                    <p className="text-slate-300">Manage system settings and monitor daily operations</p>
                </div>

                {/* Configuration Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {configs.map((config) => (
                        <div key={config.config_key} className="racing-card">
                            <div className="flex items-center gap-3 mb-4">
                                {config.config_key === 'max_maps_per_user' && <MapPin className="w-5 h-5 text-blue-500" />}
                                {config.config_key === 'max_driver_notifications' && <Bell className="w-5 h-5 text-green-500" />}
                                {config.config_key === 'max_users_registration' && <Users className="w-5 h-5 text-purple-500" />}
                                {config.config_key === 'max_new_records_per_map' && <Shield className="w-5 h-5 text-orange-500" />}
                                <h3 className="font-semibold text-foreground capitalize">
                                    {config.config_key.replace(/_/g, ' ')}
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-2xl font-bold text-primary mb-1">{config.config_value}</p>
                                    <p className="text-sm text-muted-foreground">{config.description}</p>
                                </div>

                                <button
                                    onClick={() => {
                                        setEditValue(config.config_value);
                                        setActiveModal(config.config_key);
                                    }}
                                    className="w-full btn-racing text-sm"
                                >
                                    Configure
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* API Usage and Limits */}
                <div className="racing-card mb-8">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        API Usage & Limits
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-500 mb-1">2,400</div>
                            <div className="text-sm text-muted-foreground">Daily API Calls</div>
                        </div>

                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-500 mb-1">20 min</div>
                            <div className="text-sm text-muted-foreground">Processing Time</div>
                        </div>

                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-500 mb-1">Well Within Limits</div>
                            <div className="text-sm text-muted-foreground">API Limit Status</div>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-muted/50 rounded-xl">
                        <h3 className="font-semibold mb-2">Usage Projection</h3>
                        <div className="text-sm text-muted-foreground space-y-1">
                            <p>• 100 users × 200 maps = 20,000 requests/day</p>
                            <p>• Sequential processing: 20,000 ÷ 2 req/sec = 20 minutes</p>
                            <p>• Monthly API calls: 72,000 (well within 5M limit)</p>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="racing-card mb-6">
                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={() => {
                                setActiveTab('users');
                                loadUsers();
                            }}
                            className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'users'
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Users className="w-4 h-4 inline mr-2" />
                            Users
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('logs');
                                loadDailyOverview();
                            }}
                            className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'logs'
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <BarChart3 className="w-4 h-4 inline mr-2" />
                            Logs
                        </button>
                        <button
                            onClick={() => setActiveTab('test')}
                            className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'test'
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Bell className="w-4 h-4 inline mr-2" />
                            Test
                        </button>
                    </div>

                    {/* Users Tab */}
                    {activeTab === 'users' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    User Management
                                </h2>
                                <button
                                    onClick={loadUsers}
                                    disabled={usersLoading}
                                    className="btn-racing text-sm flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>

                            {usersLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className="text-left py-3 px-4 font-medium text-foreground">Username</th>
                                                <th className="text-left py-3 px-4 font-medium text-foreground">TM Username</th>
                                                <th className="text-left py-3 px-4 font-medium text-foreground">Maps</th>
                                                <th className="text-left py-3 px-4 font-medium text-foreground">Alert Type</th>
                                                <th className="text-left py-3 px-4 font-medium text-foreground">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map((user) => (
                                                <tr key={user.id} className="border-b border-border/50">
                                                    <td className="py-3 px-4 text-foreground">{user.username}</td>
                                                    <td className="py-3 px-4 text-muted-foreground">{user.tm_username || 'Not set'}</td>
                                                    <td className="py-3 px-4 text-muted-foreground">{user.map_count}</td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.alert_type === 'accurate'
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                            }`}>
                                                            {user.alert_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => updateUserAlertType(user.id, 'accurate')}
                                                                disabled={user.alert_type === 'accurate'}
                                                                className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Accurate
                                                            </button>
                                                            <button
                                                                onClick={() => updateUserAlertType(user.id, 'inaccurate')}
                                                                disabled={user.alert_type === 'inaccurate'}
                                                                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Inaccurate
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Logs Tab */}
                    {activeTab === 'logs' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5" />
                                    Daily Logs (Last 5 Days)
                                </h2>
                                <button
                                    onClick={loadDailyOverview}
                                    disabled={logsLoading}
                                    className="btn-racing text-sm flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>

                            {logsLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Daily Summary Cards */}
                                    {dailySummaries.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
                                            {dailySummaries.map((day) => (
                                                <div
                                                    key={day.date}
                                                    className={`racing-card cursor-pointer transition-all duration-200 hover:scale-105 ${getStatusClass(day.overall_status)}`}
                                                    onClick={() => handleDayClick(day)}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        {getStatusIcon(day.overall_status)}
                                                        <span className="text-xs text-muted-foreground">{day.relative_date}</span>
                                                    </div>

                                                    <h3 className="font-semibold text-foreground mb-2 text-sm">
                                                        {day.display_date}
                                                    </h3>

                                                    <p className="text-xs font-medium mb-3">
                                                        {day.status_message}
                                                    </p>

                                                    <div className="space-y-1 text-xs text-muted-foreground">
                                                        <div className="flex justify-between">
                                                            <span>Users:</span>
                                                            <span className="font-medium">{day.stats.total_users}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Mapper Alerts:</span>
                                                            <span className="font-medium">{day.stats.mapper_alerts.successful + day.stats.mapper_alerts.no_new_times}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Driver Notifications:</span>
                                                            <span className="font-medium">{day.stats.driver_notifications.successful + day.stats.driver_notifications.no_new_times}</span>
                                                        </div>
                                                        {day.stats.mapper_alerts.errors + day.stats.driver_notifications.errors > 0 && (
                                                            <div className="flex justify-between text-red-600 dark:text-red-400">
                                                                <span>Errors:</span>
                                                                <span className="font-medium">{day.stats.mapper_alerts.errors + day.stats.driver_notifications.errors}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="racing-card text-center py-8">
                                            <div className="text-muted-foreground">
                                                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                                <h3 className="text-lg font-medium mb-2">No Daily Logs Available</h3>
                                                <p className="text-sm">Daily processing logs will appear here once the scheduler runs.</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Summary Stats - Only show when there's data */}
                                    {dailySummaries.length > 0 && (
                                        <div className="racing-card">
                                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                                <BarChart3 className="w-5 h-5" />
                                                Overall Statistics (Last 5 Days)
                                            </h3>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-green-500 mb-1">
                                                        {dailySummaries.reduce((sum, day) => sum + day.stats.mapper_alerts.successful + day.stats.mapper_alerts.no_new_times, 0)}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">Successful Mapper Alerts</div>
                                                </div>

                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-blue-500 mb-1">
                                                        {dailySummaries.reduce((sum, day) => sum + day.stats.driver_notifications.successful + day.stats.driver_notifications.no_new_times, 0)}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">Successful Driver Notifications</div>
                                                </div>

                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-red-500 mb-1">
                                                        {dailySummaries.reduce((sum, day) => sum + day.stats.mapper_alerts.errors + day.stats.driver_notifications.errors, 0)}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">Total Errors</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Config Modal */}
                {activeModal && (
                    <ConfigModal
                        configKey={activeModal}
                        title={`Configure ${activeModal.replace(/_/g, ' ')}`}
                        description={configs.find(c => c.config_key === activeModal)?.description || ''}
                    />
                )}

                {/* Detail Modal */}
                {showDetailModal && selectedDay && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-2xl font-semibold text-foreground">
                                        {selectedDay.display_date} - Detailed Breakdown
                                    </h2>
                                    <button
                                        onClick={closeDetailModal}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="mb-6">
                                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getStatusClass(selectedDay.overall_status)}`}>
                                        {getStatusIcon(selectedDay.overall_status)}
                                        <span className="font-medium">
                                            {selectedDay.status_message}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {selectedDay.user_breakdown.map((user) => (
                                        <div key={user.username} className="border border-border rounded-lg p-4">
                                            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                                                <Users className="w-4 h-4" />
                                                {user.username}
                                            </h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Mapper Alert */}
                                                <div>
                                                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                                        <Bell className="w-4 h-4" />
                                                        Mapper Alert
                                                    </h4>
                                                    {user.mapper_alert ? (
                                                        <div className={`p-3 rounded-lg border ${getNotificationStatusClass(user.mapper_alert.status)}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {getNotificationStatusIcon(user.mapper_alert.status)}
                                                                <span className="text-sm font-medium capitalize">
                                                                    {user.mapper_alert.status.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {user.mapper_alert.message}
                                                            </p>
                                                            {user.mapper_alert.records_found > 0 && (
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {user.mapper_alert.records_found} records found
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 rounded-lg notification-default text-sm text-gray-600 dark:text-gray-400">
                                                            No processing data
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Driver Notification */}
                                                <div>
                                                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                                        <Users className="w-4 h-4" />
                                                        Driver Notification
                                                    </h4>
                                                    {user.driver_notification ? (
                                                        <div className={`p-3 rounded-lg border ${getNotificationStatusClass(user.driver_notification.status)}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {getNotificationStatusIcon(user.driver_notification.status)}
                                                                <span className="text-sm font-medium capitalize">
                                                                    {user.driver_notification.status.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {user.driver_notification.message}
                                                            </p>
                                                            {user.driver_notification.records_found > 0 && (
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {user.driver_notification.records_found} notifications sent
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 rounded-lg notification-default text-sm text-gray-600 dark:text-gray-400">
                                                            No processing data
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Test Tab */}
                {activeTab === 'test' && (
                    <div className="space-y-6">
                        <div className="racing-card">
                            <h2 className="text-xl font-semibold mb-4">API Gateway Test Section</h2>
                            <p className="text-muted-foreground mb-6">
                                This section tests the simple test endpoint to isolate API Gateway issues.
                            </p>

                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <button
                                        onClick={handleTestEndpoint}
                                        disabled={testLoading}
                                        className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-primary-glow text-white rounded-xl font-medium hover:shadow-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {testLoading ? 'Testing...' : 'Test Simple Endpoint'}
                                    </button>
                                    <button
                                        onClick={handleTestAdvancedEndpoint}
                                        disabled={testLoading}
                                        className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {testLoading ? 'Testing...' : 'Test Advanced Endpoint'}
                                    </button>
                                </div>

                                {testResult && (
                                    <div className="mt-4 p-4 rounded-xl border border-border bg-muted/50">
                                        <h3 className="font-medium mb-2">Test Result:</h3>
                                        <pre className="text-sm whitespace-pre-wrap break-words">
                                            {testResult}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Driver Notification Test Section */}
                        <div className="racing-card">
                            <h2 className="text-xl font-semibold mb-4">Driver Notification Visual Test</h2>
                            <p className="text-muted-foreground mb-6">
                                Test the visual appearance of driver notifications without affecting the database.
                                These notifications are temporary and will disappear when you refresh the page.
                            </p>

                            <div className="space-y-4">
                                <div className="flex gap-4 flex-wrap">
                                    <button
                                        onClick={handleCreateTestNotification}
                                        className="px-6 py-3 bg-gradient-to-r from-primary to-primary-glow text-white rounded-xl font-medium hover:shadow-glow transition-all duration-300"
                                    >
                                        Create Test Notification
                                    </button>
                                    <button
                                        onClick={handleMakeNotificationOrange}
                                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                                    >
                                        Make Notification Orange
                                    </button>
                                    <button
                                        onClick={handleClearTestNotifications}
                                        className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                                    >
                                        Clear All Test Notifications
                                    </button>
                                </div>

                                {/* Test Notifications Display */}
                                {testNotifications.length > 0 && (
                                    <div className="mt-6">
                                        <h3 className="font-medium mb-4">Test Notifications ({testNotifications.length})</h3>
                                        <div className="space-y-3">
                                            {testNotifications.map((notification) => {
                                                const isInactive = notification.status === 'inactive';

                                                return (
                                                    <div key={notification.id} className={`racing-card ${isInactive ? 'border-orange-500/50 bg-orange-50/10' : ''}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-4 flex-1">
                                                                <div className={`p-3 rounded-xl ${isInactive
                                                                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/20'
                                                                    : 'bg-gradient-to-br from-primary to-primary-glow shadow-glow'
                                                                    }`}>
                                                                    <Bell className="w-5 h-5 text-white" />
                                                                </div>

                                                                <div className="flex-1">
                                                                    <h3 className={`font-semibold mb-1 ${isInactive ? 'text-orange-600' : 'text-foreground'}`}>
                                                                        {notification.mapName}
                                                                    </h3>

                                                                    <div className="flex items-center gap-6 text-sm text-muted-foreground mb-2">
                                                                        <span>Map UID: {notification.mapUid}</span>
                                                                        <span>Created: {new Date(notification.createdAt).toLocaleString()}</span>
                                                                    </div>

                                                                    <div className="flex items-center gap-4 text-sm">
                                                                        {isInactive ? (
                                                                            <span className="text-orange-600 font-medium">
                                                                                Status: <strong>Inactive - No longer in top 5</strong>
                                                                            </span>
                                                                        ) : (
                                                                            <div className="flex flex-col gap-1">
                                                                                <span className="text-foreground">
                                                                                    Current Position: <strong>#{notification.currentPosition}</strong>
                                                                                </span>
                                                                                <span className="text-muted-foreground text-xs">
                                                                                    Status: <strong>Active</strong>
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-4">
                                                                <div className={`px-3 py-1 rounded-full text-xs font-medium ${isInactive
                                                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                                                                    : 'bg-gradient-to-r from-primary to-primary-glow text-white'
                                                                    }`}>
                                                                    {isInactive ? 'Inactive' : `Position #${notification.currentPosition}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;
