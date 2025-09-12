import React, { useState, useEffect } from 'react';
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
}

interface UserProfile {
    id: string;
    email: string;
    username: string;
    createdAt: string;
}

const MapperAlerts: React.FC = () => {
    // State variables
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMapId, setNewMapId] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'manage' | 'test'>('info');
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [showAddAlertModal, setShowAddAlertModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [alertToDelete, setAlertToDelete] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<string>('');
    const [testLoading, setTestLoading] = useState(false);
    const [userLoginInfo, setUserLoginInfo] = useState<{ username: string, email: string } | null>(null);

    // Test notification state (temporary, not persisted)
    const [testNotifications, setTestNotifications] = useState<Array<{
        id: string;
        mapName: string;
        mapUid: string;
        currentPosition: number;
        status: 'active' | 'inactive';
        createdAt: string;
    }>>([]);

    useEffect(() => {
        fetchAlerts();
        fetchUserLoginInfo();
    }, []);

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

    const fetchAlerts = async () => {
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
                // The username is embedded in the mapName field like "Map for username"
                const username = firstAlert.mapName?.replace('Map for ', '') || 'your';
                setUserProfile({
                    id: '1',
                    email: '',
                    username: username,
                    createdAt: new Date().toISOString()
                });
            }
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
            const response = await apiClient.post('/api/v1/users/alerts',
                {}
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
        } catch (error) {
            toast.error('Failed to delete alert');
        }
    };

    const handleTestEndpoint = async () => {
        setTestLoading(true);
        setTestResult('');

        try {
            const response = await apiClient.post('/api/v1/test', {});
            setTestResult(`✅ SUCCESS: Lambda called successfully! Response: ${JSON.stringify(response.data)}`);
            toast.success('Test endpoint worked!');
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
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
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            setTestResult(`❌ FAILED: ${errorMsg}`);
            toast.error('Advanced test endpoint failed');
        } finally {
            setTestLoading(false);
        }
    };

    // Test functions for driver notifications
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
        toast.success('Cleared all test notifications');
    };

    const handleCancelDelete = () => {
        setShowDeleteModal(false);
        setAlertToDelete(null);
    };

    const handleAddAlertClick = () => {
        setShowAddAlertModal(true);
    };

    const handleConfirmAddAlert = async () => {
        try {
            await apiClient.post('/api/v1/users/alerts', {});
            toast.success('Alert created successfully!');
            setShowAddAlertModal(false);
            fetchAlerts();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to create alert');
        }
    };

    const handleCancelAddAlert = () => {
        setShowAddAlertModal(false);
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
                        <button
                            onClick={() => setActiveTab('test')}
                            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'test'
                                ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Bell className="w-4 h-4" />
                            Test Section
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
                                    When you add an alert, it gets triggered once per day. It will fetch your username from trackmania exchange and go through all of your created maps and fetch new times driven in the past 24 hours. If any new times are found, you will get a notification email. If you want to stop the notifications, you can click on manage alerts and remove the alert.
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
                                    <p className="text-muted-foreground mb-6">
                                        Add your first map alert to get notifications when someone drives your maps
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
                                    onClick={handleCancelAddAlert}
                                    className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmAddAlert}
                                    className="flex-1 btn-racing"
                                >
                                    OK
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

                {/* Test Section Tab */}
                {activeTab === 'test' && (
                    <div className="space-y-6">
                        <div className="bg-card rounded-xl border border-border p-6">
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
                        <div className="bg-card rounded-xl border border-border p-6">
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
                                                                    {isInactive ? (
                                                                        <Bell className="w-5 h-5 text-white" />
                                                                    ) : (
                                                                        <Bell className="w-5 h-5 text-white" />
                                                                    )}
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

export default MapperAlerts;