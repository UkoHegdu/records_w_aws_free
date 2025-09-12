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
    const [activeTab, setActiveTab] = useState<'info' | 'manage'>('info');
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [showAddAlertModal, setShowAddAlertModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [alertToDelete, setAlertToDelete] = useState<string | null>(null);

    useEffect(() => {
        fetchAlerts();
    }, []);

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
            </div>
        </div>
    );
};

export default MapperAlerts;